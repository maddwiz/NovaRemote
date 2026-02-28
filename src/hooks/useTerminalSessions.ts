import { useCallback, useRef, useState } from "react";

import { apiRequest } from "../api/client";
import { DEFAULT_CWD, isLikelyAiSession, makeShellSessionName, sortByCreatedAt } from "../constants";
import {
  CodexMessageResponse,
  CodexStartResponse,
  ServerProfile,
  SessionMeta,
  ShellRunResponse,
  TerminalSendMode,
  TmuxTailResponse,
} from "../types";

type UseTerminalSessionsArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

export function useTerminalSessions({ activeServer, connected }: UseTerminalSessionsArgs) {
  const [allSessions, setAllSessions] = useState<string[]>([]);
  const [openSessions, setOpenSessions] = useState<string[]>([]);
  const [tails, setTails] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [sendBusy, setSendBusy] = useState<Record<string, boolean>>({});
  const [sendModes, setSendModes] = useState<Record<string, TerminalSendMode>>({});

  const [startCwd, setStartCwd] = useState<string>(DEFAULT_CWD);
  const [startPrompt, setStartPrompt] = useState<string>("");
  const [startOpenOnMac, setStartOpenOnMac] = useState<boolean>(true);
  const [startKind, setStartKind] = useState<TerminalSendMode>("ai");

  const [focusedSession, setFocusedSession] = useState<string | null>(null);

  const sendInFlight = useRef<Set<string>>(new Set());

  const resetTerminalState = useCallback(() => {
    setAllSessions([]);
    setOpenSessions([]);
    setTails({});
    setDrafts({});
    setSendBusy({});
    setSendModes({});
    setFocusedSession(null);
  }, []);

  const refreshSessions = useCallback(async () => {
    if (!activeServer || !connected) {
      throw new Error("Select a server with URL and token first.");
    }

    const data = await apiRequest<{ sessions: SessionMeta[] }>(
      activeServer.baseUrl,
      activeServer.token,
      "/tmux/sessions"
    );

    const names = sortByCreatedAt(data.sessions || []).map((entry) => entry.name);
    setAllSessions(names);

    setSendModes((prev) => {
      const next = { ...prev };
      names.forEach((session) => {
        if (!next[session]) {
          next[session] = isLikelyAiSession(session) ? "ai" : "shell";
        }
      });
      Object.keys(next).forEach((session) => {
        if (!names.includes(session)) {
          delete next[session];
        }
      });
      return next;
    });

    setOpenSessions((prev) => {
      const existing = prev.filter((name) => names.includes(name));
      if (existing.length > 0) {
        return existing;
      }
      if (names.length > 0) {
        return [names[0]];
      }
      return [];
    });
  }, [activeServer, connected]);

  const toggleSessionVisible = useCallback((session: string) => {
    setOpenSessions((prev) => {
      if (prev.includes(session)) {
        return prev.filter((name) => name !== session);
      }
      return [session, ...prev];
    });
  }, []);

  const removeOpenSession = useCallback((session: string) => {
    setOpenSessions((prev) => prev.filter((name) => name !== session));
    setFocusedSession((prev) => (prev === session ? null : prev));
  }, []);

  const setSessionMode = useCallback((session: string, mode: TerminalSendMode) => {
    setSendModes((prev) => ({ ...prev, [session]: mode }));
  }, []);

  const handleStartSession = useCallback(async () => {
    if (!activeServer || !connected) {
      throw new Error("Connect to a server first.");
    }

    const cwd = startCwd.trim() || activeServer.defaultCwd || DEFAULT_CWD;

    if (startKind === "ai") {
      const payload = {
        cwd,
        initial_prompt: startPrompt.trim() || null,
        open_on_mac: startOpenOnMac,
      };

      const data = await apiRequest<CodexStartResponse>(activeServer.baseUrl, activeServer.token, "/codex/start", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const session = data.session;
      setAllSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
      setOpenSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
      setSendModes((prev) => ({ ...prev, [session]: "ai" }));
      if (data.tail) {
        setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
      }

      if (startPrompt.trim()) {
        setStartPrompt("");
      }

      if (startOpenOnMac && data.open_on_mac && !data.open_on_mac.opened) {
        throw new Error(data.open_on_mac.error || "Session started, but Mac open failed.");
      }

      return session;
    }

    const session = makeShellSessionName();
    await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/session", {
      method: "POST",
      body: JSON.stringify({ session, cwd }),
    });

    const initialCommand = startPrompt.trim();
    if (initialCommand) {
      await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/send", {
        method: "POST",
        body: JSON.stringify({ session, text: initialCommand, enter: true }),
      });
      setStartPrompt("");
    }

    const tail = await apiRequest<TmuxTailResponse>(
      activeServer.baseUrl,
      activeServer.token,
      `/tmux/tail?session=${encodeURIComponent(session)}&lines=380`
    );

    setAllSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    setOpenSessions((prev) => (prev.includes(session) ? prev : [session, ...prev]));
    setSendModes((prev) => ({ ...prev, [session]: "shell" }));
    setTails((prev) => ({ ...prev, [session]: tail.output || "" }));

    return session;
  }, [activeServer, connected, startCwd, startKind, startOpenOnMac, startPrompt]);

  const sendCommand = useCallback(
    async (session: string, command: string, mode: TerminalSendMode, clearDraft: boolean = false) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const currentDraft = command.trim();
      if (!currentDraft) {
        return;
      }

      if (sendInFlight.current.has(session)) {
        return;
      }

      sendInFlight.current.add(session);
      setSendBusy((prev) => ({ ...prev, [session]: true }));
      if (clearDraft) {
        setDrafts((prev) => ({ ...prev, [session]: "" }));
      }

      try {
        if (mode === "ai") {
          const data = await apiRequest<CodexMessageResponse>(activeServer.baseUrl, activeServer.token, "/codex/message", {
            method: "POST",
            body: JSON.stringify({ session, message: currentDraft }),
          });

          if (data.tail) {
            setTails((prev) => ({ ...prev, [session]: data.tail || "" }));
          }
        } else {
          const data = await apiRequest<ShellRunResponse>(activeServer.baseUrl, activeServer.token, "/shell/run", {
            method: "POST",
            body: JSON.stringify({ session, command: currentDraft, wait_ms: 400, tail_lines: 380 }),
          });

          if (data.output) {
            setTails((prev) => ({ ...prev, [session]: data.output || "" }));
          }
        }
      } catch (error) {
        if (clearDraft) {
          setDrafts((prev) => ({ ...prev, [session]: currentDraft }));
        }
        throw error;
      } finally {
        sendInFlight.current.delete(session);
        setSendBusy((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeServer, connected]
  );

  const handleSend = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const currentDraft = (drafts[session] || "").trim();
      if (!currentDraft) {
        return "";
      }

      const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
      await sendCommand(session, currentDraft, mode, true);
      return currentDraft;
    },
    [activeServer, connected, drafts, sendCommand, sendModes]
  );

  const handleStop = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      await apiRequest(activeServer.baseUrl, activeServer.token, "/tmux/ctrl", {
        method: "POST",
        body: JSON.stringify({ session, key: "C-c" }),
      });
    },
    [activeServer, connected]
  );

  const handleOpenOnMac = useCallback(
    async (session: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      await apiRequest(activeServer.baseUrl, activeServer.token, "/mac/attach", {
        method: "POST",
        body: JSON.stringify({ session }),
      });
    },
    [activeServer, connected]
  );

  return {
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    sendModes,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    focusedSession,
    setOpenSessions,
    setTails,
    setDrafts,
    setStartCwd,
    setStartPrompt,
    setStartOpenOnMac,
    setStartKind,
    setFocusedSession,
    resetTerminalState,
    refreshSessions,
    toggleSessionVisible,
    removeOpenSession,
    setSessionMode,
    handleStartSession,
    handleSend,
    sendCommand,
    handleStop,
    handleOpenOnMac,
  };
}

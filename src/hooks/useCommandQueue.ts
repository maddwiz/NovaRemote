import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_COMMAND_QUEUE_PREFIX } from "../constants";
import { QueuedCommand, QueuedCommandStatus, TerminalSendMode } from "../types";

type UseCommandQueueArgs = {
  activeServerId: string | null;
  allSessions: string[];
  connected: boolean;
  sessionReadOnly: Record<string, boolean>;
  isLocalSession: (session: string) => boolean;
  shouldRouteToExternalAi: (session: string) => boolean;
  sendViaExternalLlm: (session: string, prompt: string) => Promise<string>;
  sendCommand: (session: string, command: string, mode: TerminalSendMode, clearDraft?: boolean) => Promise<void>;
  addCommand: (session: string, command: string) => Promise<void>;
  clearDraftForSession: (session: string) => void;
  onQueued: (message: string) => void;
};

function makeQueueCommandId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function commandQueueStatus(item: QueuedCommand): QueuedCommandStatus {
  if (item.status === "sending" || item.status === "sent" || item.status === "failed") {
    return item.status;
  }
  return "pending";
}

function normalizeQueuedCommand(item: unknown): QueuedCommand | null {
  if (!item || typeof item !== "object") {
    return null;
  }
  const raw = item as Record<string, unknown>;
  const command = typeof raw.command === "string" ? raw.command.trim() : "";
  if (!command) {
    return null;
  }
  const mode = raw.mode === "ai" ? "ai" : "shell";
  const status = raw.status === "sending" || raw.status === "sent" || raw.status === "failed" ? raw.status : "pending";
  return {
    id: typeof raw.id === "string" && raw.id ? raw.id : makeQueueCommandId(),
    command,
    mode,
    queuedAt: typeof raw.queuedAt === "string" && raw.queuedAt ? raw.queuedAt : new Date().toISOString(),
    status,
    lastError: typeof raw.lastError === "string" ? raw.lastError : null,
    sentAt: typeof raw.sentAt === "string" ? raw.sentAt : null,
  };
}

export function useCommandQueue({
  activeServerId,
  allSessions,
  connected,
  sessionReadOnly,
  isLocalSession,
  shouldRouteToExternalAi,
  sendViaExternalLlm,
  sendCommand,
  addCommand,
  clearDraftForSession,
  onQueued,
}: UseCommandQueueArgs) {
  const [commandQueue, setCommandQueue] = useState<Record<string, QueuedCommand[]>>({});

  const queueSessionCommand = useCallback(
    (session: string, command: string, mode: TerminalSendMode) => {
      const trimmed = command.trim();
      if (!trimmed) {
        return;
      }
      setCommandQueue((prev) => {
        const existing = prev[session] || [];
        const nextQueue = [
          ...existing,
          {
            id: makeQueueCommandId(),
            command: trimmed,
            mode,
            queuedAt: new Date().toISOString(),
            status: "pending" as QueuedCommandStatus,
            lastError: null,
            sentAt: null,
          },
        ].slice(-50);
        return {
          ...prev,
          [session]: nextQueue,
        };
      });
      clearDraftForSession(session);
      onQueued(`Queued command for ${session}. It will run when connection is restored.`);
    },
    [clearDraftForSession, onQueued]
  );

  const flushSessionQueue = useCallback(
    async (session: string, options?: { includeFailed?: boolean }) => {
      const initialQueue = commandQueue[session] || [];
      if (initialQueue.length === 0) {
        return 0;
      }
      const includeFailed = options?.includeFailed ?? true;
      if (sessionReadOnly[session]) {
        throw new Error(`${session} is read-only. Disable read-only to flush queued commands.`);
      }

      if (!connected && !isLocalSession(session)) {
        throw new Error("Reconnect to flush queued commands for this session.");
      }

      const queue = initialQueue.map((item) => (item.id ? item : { ...item, id: makeQueueCommandId() }));
      if (queue.some((item, index) => initialQueue[index]?.id !== item.id)) {
        setCommandQueue((prev) => ({ ...prev, [session]: queue }));
      }

      const shouldFlushItem = (item: QueuedCommand): boolean => {
        const status = commandQueueStatus(item);
        if (status === "pending" || status === "sending") {
          return true;
        }
        return includeFailed && status === "failed";
      };

      const updatable = queue.filter(shouldFlushItem);
      if (updatable.length === 0) {
        return 0;
      }

      let sentCount = 0;
      for (const item of updatable) {
        const itemId = item.id as string;
        setCommandQueue((prev) => ({
          ...prev,
          [session]: (prev[session] || []).map((entry) =>
            entry.id === itemId ? { ...entry, status: "sending" as QueuedCommandStatus, lastError: null } : entry
          ),
        }));

        if (item.mode === "ai" && shouldRouteToExternalAi(session)) {
          try {
            const sent = await sendViaExternalLlm(session, item.command);
            if (sent) {
              await addCommand(session, sent);
              sentCount += 1;
              setCommandQueue((prev) => ({
                ...prev,
                [session]: (prev[session] || []).map((entry) =>
                  entry.id === itemId
                    ? { ...entry, status: "sent" as QueuedCommandStatus, sentAt: new Date().toISOString(), lastError: null }
                    : entry
                ),
              }));
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            setCommandQueue((prev) => ({
              ...prev,
              [session]: (prev[session] || []).map((entry) =>
                entry.id === itemId ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: message } : entry
              ),
            }));
          }
          continue;
        }

        if (item.mode === "shell" && isLocalSession(session)) {
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId
                ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: "Shell queueing is unavailable for local-only AI sessions." }
                : entry
            ),
          }));
          continue;
        }

        try {
          await sendCommand(session, item.command, item.mode, false);
          await addCommand(session, item.command);
          sentCount += 1;
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId
                ? { ...entry, status: "sent" as QueuedCommandStatus, sentAt: new Date().toISOString(), lastError: null }
                : entry
            ),
          }));
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setCommandQueue((prev) => ({
            ...prev,
            [session]: (prev[session] || []).map((entry) =>
              entry.id === itemId ? { ...entry, status: "failed" as QueuedCommandStatus, lastError: message } : entry
            ),
          }));
        }
      }

      setCommandQueue((prev) => {
        const current = prev[session] || [];
        const retained = current
          .filter((entry) => commandQueueStatus(entry) !== "sent")
          .map((entry) => (commandQueueStatus(entry) === "sending" ? { ...entry, status: "pending" as QueuedCommandStatus } : entry));
        return { ...prev, [session]: retained };
      });
      return sentCount;
    },
    [addCommand, commandQueue, connected, isLocalSession, sendCommand, sendViaExternalLlm, sessionReadOnly, shouldRouteToExternalAi]
  );

  const removeQueuedCommand = useCallback((session: string, index: number) => {
    setCommandQueue((prev) => {
      const current = prev[session] || [];
      if (index < 0 || index >= current.length) {
        return prev;
      }
      return {
        ...prev,
        [session]: current.filter((_, itemIndex) => itemIndex !== index),
      };
    });
  }, []);

  useEffect(() => {
    setCommandQueue((prev) => {
      const next: Record<string, QueuedCommand[]> = {};
      allSessions.forEach((session) => {
        next[session] = prev[session] || [];
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    let mounted = true;
    async function loadQueuedCommands() {
      if (!activeServerId) {
        if (mounted) {
          setCommandQueue({});
        }
        return;
      }

      const raw = await SecureStore.getItemAsync(`${STORAGE_COMMAND_QUEUE_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setCommandQueue({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
          setCommandQueue({});
          return;
        }
        const next: Record<string, QueuedCommand[]> = {};
        Object.entries(parsed).forEach(([session, value]) => {
          if (!Array.isArray(value)) {
            return;
          }
          next[session] = value
            .map((entry) => normalizeQueuedCommand(entry))
            .filter((entry): entry is QueuedCommand => Boolean(entry))
            .slice(-50);
        });
        setCommandQueue(next);
      } catch {
        setCommandQueue({});
      }
    }
    void loadQueuedCommands();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_COMMAND_QUEUE_PREFIX}.${activeServerId}`, JSON.stringify(commandQueue));
  }, [activeServerId, commandQueue]);

  return {
    commandQueue,
    queueSessionCommand,
    flushSessionQueue,
    removeQueuedCommand,
  };
}


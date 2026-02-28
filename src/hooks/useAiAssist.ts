import { useCallback, useEffect, useRef, useState } from "react";

import { LlmProfile } from "../types";

type UseAiAssistArgs = {
  activeProfile: LlmProfile | null;
  sendPrompt: (profile: LlmProfile, prompt: string) => Promise<string>;
  allSessions: string[];
  tails: Record<string, string>;
  commandHistory: Record<string, string[]>;
  drafts: Record<string, string>;
};

function parseSuggestionOutput(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) {
    return [];
  }

  try {
    const parsed = JSON.parse(trimmed) as unknown;
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => (typeof item === "string" ? item.trim() : ""))
        .filter(Boolean)
        .slice(0, 3);
    }
  } catch {
    // Fall back to line parsing.
  }

  return trimmed
    .split("\n")
    .map((line) => line.replace(/^[\s\-*\d\.\)]*/, "").trim())
    .filter(Boolean)
    .slice(0, 3);
}

function detectTerminalErrorLine(output: string): string | null {
  const lines = output
    .split("\n")
    .slice(-140)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length === 0) {
    return null;
  }

  const patterns = [
    /\berror\b/i,
    /\bexception\b/i,
    /\btraceback\b/i,
    /\bfatal\b/i,
    /\bpanic\b/i,
    /\bfailed\b/i,
    /\bcommand not found\b/i,
    /\bpermission denied\b/i,
    /\bsegmentation fault\b/i,
    /\bno such file or directory\b/i,
    /\bsyntax error\b/i,
    /\bmodule not found\b/i,
  ];

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (!line) {
      continue;
    }
    if (/^\d+\s+errors?/.test(line.toLowerCase())) {
      continue;
    }
    if (patterns.some((pattern) => pattern.test(line))) {
      return line.slice(0, 280);
    }
  }

  return null;
}

export function useAiAssist({ activeProfile, sendPrompt, allSessions, tails, commandHistory, drafts }: UseAiAssistArgs) {
  const [suggestionsBySession, setSuggestionsBySession] = useState<Record<string, string[]>>({});
  const [suggestionBusyBySession, setSuggestionBusyBySession] = useState<Record<string, boolean>>({});
  const [errorHintsBySession, setErrorHintsBySession] = useState<Record<string, string>>({});
  const [triageBusyBySession, setTriageBusyBySession] = useState<Record<string, boolean>>({});
  const [triageExplanationBySession, setTriageExplanationBySession] = useState<Record<string, string>>({});
  const [triageFixesBySession, setTriageFixesBySession] = useState<Record<string, string[]>>({});
  const triageHintRef = useRef<Record<string, string>>({});

  const requestShellSuggestions = useCallback(
    async (session: string) => {
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to use shell suggestions.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-50)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-5).join("\n");
      const draft = drafts[session] || "";
      const prompt = [
        "You are assisting with shell command suggestions.",
        "Return strictly JSON: an array of 3 short shell commands with no explanation.",
        "Prioritize safe diagnostic commands first.",
        "",
        `Session: ${session}`,
        draft ? `Current draft: ${draft}` : "Current draft: (empty)",
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setSuggestionBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const raw = await sendPrompt(activeProfile, prompt);
        const parsed = parseSuggestionOutput(raw);
        setSuggestionsBySession((prev) => ({ ...prev, [session]: parsed }));
      } finally {
        setSuggestionBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, drafts, sendPrompt, tails]
  );

  const explainSessionError = useCallback(
    async (session: string) => {
      const errorLine = errorHintsBySession[session];
      if (!errorLine) {
        throw new Error("No recent error detected for this session.");
      }
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to analyze errors.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-80)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-6).join("\n");
      const prompt = [
        "You are a terminal troubleshooting assistant.",
        "Explain the likely root cause in plain language and list exactly 3 actionable debugging steps.",
        "Keep it concise, no markdown.",
        "",
        `Session: ${session}`,
        `Detected error line: ${errorLine}`,
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setTriageBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const response = await sendPrompt(activeProfile, prompt);
        setTriageExplanationBySession((prev) => ({ ...prev, [session]: response.trim() }));
      } finally {
        setTriageBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, errorHintsBySession, sendPrompt, tails]
  );

  const suggestSessionErrorFixes = useCallback(
    async (session: string) => {
      const errorLine = errorHintsBySession[session];
      if (!errorLine) {
        throw new Error("No recent error detected for this session.");
      }
      if (!activeProfile) {
        throw new Error("Configure an external LLM profile to generate fixes.");
      }

      const tailLines = (tails[session] || "")
        .split("\n")
        .slice(-80)
        .join("\n");
      const recentCommands = (commandHistory[session] || []).slice(-6).join("\n");
      const prompt = [
        "You are generating safe shell fixes for a terminal error.",
        "Return strictly JSON: an array of 3 shell commands only, no explanation.",
        "Commands must be minimally destructive and useful for diagnostics/fix.",
        "",
        `Session: ${session}`,
        `Detected error line: ${errorLine}`,
        "Recent commands:",
        recentCommands || "(none)",
        "Recent terminal output:",
        tailLines || "(none)",
      ].join("\n");

      setTriageBusyBySession((prev) => ({ ...prev, [session]: true }));
      try {
        const response = await sendPrompt(activeProfile, prompt);
        const fixes = parseSuggestionOutput(response)
          .map((entry) => entry.replace(/^`+|`+$/g, "").trim())
          .filter(Boolean);
        setTriageFixesBySession((prev) => ({ ...prev, [session]: fixes }));
      } finally {
        setTriageBusyBySession((prev) => ({ ...prev, [session]: false }));
      }
    },
    [activeProfile, commandHistory, errorHintsBySession, sendPrompt, tails]
  );

  useEffect(() => {
    setSuggestionsBySession((prev) => {
      const next: Record<string, string[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setSuggestionBusyBySession((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setErrorHintsBySession((prev) => {
      const next: Record<string, string> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageBusyBySession((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageExplanationBySession((prev) => {
      const next: Record<string, string> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setTriageFixesBySession((prev) => {
      const next: Record<string, string[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    setErrorHintsBySession((prev) => {
      let changed = false;
      const next = { ...prev };
      allSessions.forEach((session) => {
        const hint = detectTerminalErrorLine(tails[session] || "");
        if (!hint) {
          if (next[session]) {
            delete next[session];
            changed = true;
          }
          return;
        }
        if (next[session] !== hint) {
          next[session] = hint;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [allSessions, tails]);

  useEffect(() => {
    const changedSessions: string[] = [];
    const nextFingerprint: Record<string, string> = {};
    allSessions.forEach((session) => {
      const hint = errorHintsBySession[session] || "";
      nextFingerprint[session] = hint;
      if ((triageHintRef.current[session] || "") !== hint) {
        changedSessions.push(session);
      }
    });
    triageHintRef.current = nextFingerprint;

    if (changedSessions.length === 0) {
      return;
    }

    setTriageExplanationBySession((prev) => {
      const next = { ...prev };
      changedSessions.forEach((session) => {
        delete next[session];
      });
      return next;
    });
    setTriageFixesBySession((prev) => {
      const next = { ...prev };
      changedSessions.forEach((session) => {
        delete next[session];
      });
      return next;
    });
  }, [allSessions, errorHintsBySession]);

  return {
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    requestShellSuggestions,
    explainSessionError,
    suggestSessionErrorFixes,
  };
}


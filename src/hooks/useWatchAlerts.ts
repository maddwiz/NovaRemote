import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_WATCH_RULES_PREFIX } from "../constants";
import { WatchRule } from "../types";

type UseWatchAlertsArgs = {
  activeServerId: string | null;
  allSessions: string[];
  tails: Record<string, string>;
  isPro: boolean;
  notify: (title: string, body: string) => Promise<void>;
};

function defaultWatchRule(): WatchRule {
  return { enabled: false, pattern: "", lastMatch: null };
}

export function useWatchAlerts({ activeServerId, allSessions, tails, isPro, notify }: UseWatchAlertsArgs) {
  const [watchRules, setWatchRules] = useState<Record<string, WatchRule>>({});
  const [watchAlertHistoryBySession, setWatchAlertHistoryBySession] = useState<Record<string, string[]>>({});

  const setWatchEnabled = useCallback((session: string, enabled: boolean) => {
    setWatchRules((prev) => {
      const existing = prev[session] || defaultWatchRule();
      return {
        ...prev,
        [session]: {
          ...existing,
          enabled,
        },
      };
    });
  }, []);

  const setWatchPattern = useCallback((session: string, pattern: string) => {
    setWatchRules((prev) => {
      const existing = prev[session] || { enabled: true, pattern: "", lastMatch: null };
      return {
        ...prev,
        [session]: {
          ...existing,
          pattern,
          lastMatch: null,
        },
      };
    });
    setWatchAlertHistoryBySession((prev) => {
      const next = { ...prev };
      delete next[session];
      return next;
    });
  }, []);

  const clearWatchAlerts = useCallback((session: string) => {
    setWatchAlertHistoryBySession((prev) => {
      const next = { ...prev };
      delete next[session];
      return next;
    });
  }, []);

  useEffect(() => {
    setWatchRules((prev) => {
      const next: Record<string, WatchRule> = {};
      allSessions.forEach((session) => {
        next[session] = prev[session] || defaultWatchRule();
      });
      return next;
    });
    setWatchAlertHistoryBySession((prev) => {
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
    let mounted = true;
    async function loadWatchRules() {
      if (!activeServerId) {
        if (mounted) {
          setWatchRules({});
        }
        return;
      }

      const raw = await SecureStore.getItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }

      if (!raw) {
        setWatchRules({});
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Record<string, WatchRule>;
        setWatchRules(parsed && typeof parsed === "object" ? parsed : {});
      } catch {
        setWatchRules({});
      }
    }

    void loadWatchRules();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_WATCH_RULES_PREFIX}.${activeServerId}`, JSON.stringify(watchRules));
  }, [activeServerId, watchRules]);

  useEffect(() => {
    if (!isPro) {
      return;
    }
    const enabledRules = Object.values(watchRules).some((rule) => Boolean(rule?.enabled && rule.pattern?.trim()));
    if (!enabledRules) {
      return;
    }

    const matchesBySession: Record<string, string> = {};
    for (const session of Object.keys(watchRules)) {
      const rule = watchRules[session];
      if (!rule?.enabled || !rule.pattern.trim()) {
        continue;
      }

      let regex: RegExp;
      try {
        regex = new RegExp(rule.pattern, "i");
      } catch {
        continue;
      }

      const lines = (tails[session] || "").split("\n").slice(-240);
      const matchedLine = [...lines].reverse().find((line) => regex.test(line.trim()));
      if (matchedLine && matchedLine.trim() && matchedLine.trim() !== (rule.lastMatch || "")) {
        matchesBySession[session] = matchedLine.trim();
      }
    }

    const pending = Object.entries(matchesBySession);
    if (pending.length === 0) {
      return;
    }

    setWatchRules((prev) => {
      const next = { ...prev };
      pending.forEach(([session, match]) => {
        const existing = next[session] || defaultWatchRule();
        next[session] = { ...existing, lastMatch: match };
      });
      return next;
    });

    setWatchAlertHistoryBySession((prev) => {
      const next = { ...prev };
      pending.forEach(([session, match]) => {
        const stamp = new Date().toLocaleTimeString();
        const existing = next[session] || [];
        next[session] = [`[${stamp}] ${match}`, ...existing].slice(0, 12);
      });
      return next;
    });

    pending.forEach(([session, match]) => {
      void notify("Watch alert", `${session}: ${match.slice(0, 120)}`);
    });
  }, [isPro, notify, tails, watchRules]);

  return {
    watchRules,
    watchAlertHistoryBySession,
    setWatchEnabled,
    setWatchPattern,
    clearWatchAlerts,
  };
}


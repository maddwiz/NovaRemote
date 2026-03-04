import { WatchRule } from "./types";

export const WATCH_SCAN_LINE_LIMIT = 240;

export type WatchMatch = {
  session: string;
  match: string;
};

export function findWatchMatches(
  watchRules: Record<string, WatchRule>,
  tails: Record<string, string>,
  lineLimit: number = WATCH_SCAN_LINE_LIMIT
): WatchMatch[] {
  const matches: WatchMatch[] = [];

  Object.entries(watchRules).forEach(([session, rule]) => {
    if (!rule?.enabled || !rule.pattern.trim()) {
      return;
    }

    let regex: RegExp;
    try {
      regex = new RegExp(rule.pattern, "i");
    } catch {
      return;
    }

    const lines = (tails[session] || "").split("\n").slice(-lineLimit);
    const matchedLine = [...lines].reverse().find((line) => regex.test(line.trim()));
    const match = matchedLine?.trim() || "";
    if (!match || match === (rule.lastMatch || "")) {
      return;
    }

    matches.push({ session, match });
  });

  return matches;
}

export function applyWatchMatches(
  watchRules: Record<string, WatchRule>,
  matches: WatchMatch[]
): { nextRules: Record<string, WatchRule>; changed: boolean } {
  if (matches.length === 0) {
    return {
      nextRules: watchRules,
      changed: false,
    };
  }

  const nextRules: Record<string, WatchRule> = { ...watchRules };
  matches.forEach(({ session, match }) => {
    const existing = nextRules[session] || { enabled: false, pattern: "", lastMatch: null };
    nextRules[session] = {
      ...existing,
      lastMatch: match,
    };
  });

  return {
    nextRules,
    changed: true,
  };
}


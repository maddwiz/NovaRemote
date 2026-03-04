import { describe, expect, it } from "vitest";

import { WatchRule } from "./types";
import { applyWatchMatches, findWatchMatches } from "./watchAlerts";

describe("findWatchMatches", () => {
  it("returns latest line matches for enabled valid rules", () => {
    const rules: Record<string, WatchRule> = {
      main: { enabled: true, pattern: "error", lastMatch: null },
      build: { enabled: true, pattern: "warning", lastMatch: "warning: old" },
      idle: { enabled: false, pattern: "error", lastMatch: null },
      invalid: { enabled: true, pattern: "(", lastMatch: null },
    };

    const tails = {
      main: "ok\nerror: first\ninfo\nerror: latest\n",
      build: "warning: old\nwarning: old\n",
      idle: "error: hidden\n",
      invalid: "anything\n",
    };

    const matches = findWatchMatches(rules, tails);
    expect(matches).toEqual([{ session: "main", match: "error: latest" }]);
  });
});

describe("applyWatchMatches", () => {
  it("updates lastMatch for only matched sessions", () => {
    const rules: Record<string, WatchRule> = {
      main: { enabled: true, pattern: "error", lastMatch: null },
      build: { enabled: true, pattern: "warning", lastMatch: "warning: old" },
    };

    const result = applyWatchMatches(rules, [{ session: "main", match: "error: latest" }]);
    expect(result.changed).toBe(true);
    expect(result.nextRules.main?.lastMatch).toBe("error: latest");
    expect(result.nextRules.build?.lastMatch).toBe("warning: old");
  });

  it("returns unchanged rules when no matches are provided", () => {
    const rules: Record<string, WatchRule> = {
      main: { enabled: true, pattern: "error", lastMatch: null },
    };

    const result = applyWatchMatches(rules, []);
    expect(result.changed).toBe(false);
    expect(result.nextRules).toBe(rules);
  });
});


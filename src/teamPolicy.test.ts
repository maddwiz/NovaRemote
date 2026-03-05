import { describe, expect, it } from "vitest";

import {
  findBlockedCommandPattern,
  normalizeCommandBlocklist,
  normalizeSessionTimeoutMinutes,
  resolveSessionTimeoutMs,
  teamPolicyTestUtils,
} from "./teamPolicy";

describe("teamPolicy", () => {
  it("normalizes command blocklist and timeout values", () => {
    expect(normalizeCommandBlocklist([" rm -rf ", "", "rm -rf", 123])).toEqual(["rm -rf"]);
    expect(normalizeSessionTimeoutMinutes(15)).toBe(15);
    expect(normalizeSessionTimeoutMinutes("30")).toBe(30);
    expect(normalizeSessionTimeoutMinutes("bad")).toBeNull();
    expect(resolveSessionTimeoutMs(10)).toBe(600000);
    expect(resolveSessionTimeoutMs(null)).toBeNull();
  });

  it("matches blocked commands from literal and regex patterns", () => {
    const patterns = ["rm\\s+-rf", "/drop\\s+database/i", "["];
    expect(findBlockedCommandPattern("rm -rf /tmp", patterns)).toBe("rm\\s+-rf");
    expect(findBlockedCommandPattern("DROP DATABASE prod", patterns)).toBe("/drop\\s+database/i");
    expect(findBlockedCommandPattern("echo safe", patterns)).toBeNull();
  });

  it("parses regex patterns safely", () => {
    expect(teamPolicyTestUtils.parseRegexPattern("/abc/i")?.test("ABC")).toBe(true);
    expect(teamPolicyTestUtils.parseRegexPattern("[")).toBeNull();
  });
});

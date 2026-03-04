import { describe, expect, it } from "vitest";

import { NovaAgent } from "./types";
import { agentMatchingTestUtils, findAgentIdsByName, hasExactAgentName } from "./agentMatching";

function makeAgent(agentId: string, name: string): NovaAgent {
  return {
    serverId: "dgx",
    agentId,
    name,
    status: "idle",
    currentGoal: "",
    memoryContextId: `memory-${agentId}`,
    capabilities: [],
    pendingApproval: null,
    updatedAt: "2026-03-01T00:00:00.000Z",
    lastActionAt: null,
  };
}

describe("agentMatching helpers", () => {
  const agents = [
    makeAgent("agent-1", "Build Watcher"),
    makeAgent("agent-2", "Deploy-Bot"),
    makeAgent("agent-3", "Deploy Bot"),
    makeAgent("agent-4", "Log Triager"),
  ];

  it("normalizes names by punctuation/case and collapses spaces", () => {
    expect(agentMatchingTestUtils.normalizeAgentName(" Deploy-Bot  ")).toBe("deploy bot");
  });

  it("detects exact normalized name matches", () => {
    expect(hasExactAgentName(agents, "deploy bot")).toBe(true);
    expect(hasExactAgentName(agents, "deploy--bot")).toBe(true);
    expect(hasExactAgentName(agents, "missing")).toBe(false);
  });

  it("returns exact name matches before fuzzy matches", () => {
    expect(findAgentIdsByName(agents, "deploy bot")).toEqual(["agent-2", "agent-3"]);
  });

  it("falls back to token-based matching when exact names do not exist", () => {
    expect(findAgentIdsByName(agents, "watcher build")).toEqual(["agent-1"]);
  });

  it("falls back to substring matching when needed", () => {
    expect(findAgentIdsByName(agents, "triag")).toEqual(["agent-4"]);
  });

  it("returns empty array for unknown or blank queries", () => {
    expect(findAgentIdsByName(agents, "unknown agent")).toEqual([]);
    expect(findAgentIdsByName(agents, "   ")).toEqual([]);
  });
});

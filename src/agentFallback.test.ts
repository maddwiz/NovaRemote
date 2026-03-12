import { describe, expect, it } from "vitest";

import { buildAgentRuntimeFallback } from "./agentFallback";

describe("buildAgentRuntimeFallback", () => {
  it("keeps the focused server when the target is already focused", () => {
    expect(
      buildAgentRuntimeFallback({
        targetServerId: "macbook",
        focusedServerId: "macbook",
      })
    ).toEqual({
      route: "agents",
      focusedServerId: "macbook",
      message: "Server runtime unavailable. Open the Agents screen to use the device fallback for the focused server.",
    });
  });

  it("switches focus to the requested server when another server was focused", () => {
    expect(
      buildAgentRuntimeFallback({
        targetServerId: "dgx",
        focusedServerId: "macbook",
      })
    ).toEqual({
      route: "agents",
      focusedServerId: "dgx",
      message: "Target server runtime unavailable. Open the Agents screen to use the device fallback for that server.",
    });
  });
});

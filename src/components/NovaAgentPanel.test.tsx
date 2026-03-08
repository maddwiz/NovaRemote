import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useNovaAgentRuntimeMock } = vi.hoisted(() => ({
  useNovaAgentRuntimeMock: vi.fn(),
}));

vi.mock("../hooks/useNovaAgentRuntime", () => ({
  useNovaAgentRuntime: (...args: unknown[]) => useNovaAgentRuntimeMock(...args),
}));

import { NovaAgentPanel } from "./NovaAgentPanel";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  useNovaAgentRuntimeMock.mockReset();
  const defaultRuntime = {
    agents: [],
    loading: false,
    memoryEntries: [],
    memoryLoading: false,
    addRuntimeAgent: vi.fn(),
    removeRuntimeAgent: vi.fn(),
    setRuntimeAgentStatus: vi.fn(),
    setRuntimeAgentGoal: vi.fn(),
    setRuntimeAgentCapabilities: vi.fn(),
    requestAgentApproval: vi.fn(),
    approveAgentApproval: vi.fn(),
    denyAgentApproval: vi.fn(),
    approveReadyApprovals: vi.fn(() => []),
    denyAllPendingApprovals: vi.fn(() => []),
    runMonitoringCycle: vi.fn(() => ({ requested: [], approved: [], skipped: [] })),
    clearAgentMemory: vi.fn(),
    spineContexts: [],
    findSpineContextByAgentId: vi.fn(() => null),
    pendingSpineApprovals: 0,
  };
  useNovaAgentRuntimeMock.mockReturnValue(defaultRuntime);
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("NovaAgentPanel", () => {
  it("runs a manual monitoring cycle and renders queued/dispatched feedback", async () => {
    const runMonitoringCycle = vi.fn(() => ({
      requested: ["agent-1"],
      approved: ["agent-1"],
      skipped: [],
    }));
    useNovaAgentRuntimeMock.mockReturnValue({
      agents: [
        {
          serverId: "dgx",
          agentId: "agent-1",
          name: "Monitor Bot",
          status: "monitoring",
          currentGoal: "npm run monitor",
          memoryContextId: "memory-1",
          capabilities: ["autonomous"],
          pendingApproval: null,
          updatedAt: "2026-01-01T00:00:00.000Z",
          lastActionAt: null,
        },
      ],
      loading: false,
      memoryEntries: [],
      memoryLoading: false,
      addRuntimeAgent: vi.fn(),
      removeRuntimeAgent: vi.fn(),
      setRuntimeAgentStatus: vi.fn(),
      setRuntimeAgentGoal: vi.fn(),
      setRuntimeAgentCapabilities: vi.fn(),
      requestAgentApproval: vi.fn(),
      approveAgentApproval: vi.fn(),
      denyAgentApproval: vi.fn(),
      approveReadyApprovals: vi.fn(() => []),
      denyAllPendingApprovals: vi.fn(() => []),
      runMonitoringCycle,
      clearAgentMemory: vi.fn(),
      spineContexts: [],
      findSpineContextByAgentId: vi.fn(() => null),
      pendingSpineApprovals: 0,
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
        })
      );
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Run monitoring cycle now" }).props.onPress();
    });

    expect(runMonitoringCycle).toHaveBeenCalledWith({ defaultSession: "main" });
    expect(() => renderer.root.findByProps({ children: "Queued 1 • dispatched 1" })).not.toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("disables manual monitoring button when no monitoring agents are present", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
        })
      );
    });

    const button = renderer.root.findByProps({ accessibilityLabel: "Run monitoring cycle now" });
    expect(button.props.disabled).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });
});

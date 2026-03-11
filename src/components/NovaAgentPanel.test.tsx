import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useNovaAgentRuntimeMock } = vi.hoisted(() => ({
  useNovaAgentRuntimeMock: vi.fn(),
}));
const { useNovaAdaptBridgeMock } = vi.hoisted(() => ({
  useNovaAdaptBridgeMock: vi.fn(),
}));

vi.mock("../hooks/useNovaAgentRuntime", () => ({
  useNovaAgentRuntime: (...args: unknown[]) => useNovaAgentRuntimeMock(...args),
}));
vi.mock("../hooks/useNovaAdaptBridge", () => ({
  useNovaAdaptBridge: (...args: unknown[]) => useNovaAdaptBridgeMock(...args),
}));

import { NovaAgentPanel } from "./NovaAgentPanel";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  useNovaAgentRuntimeMock.mockReset();
  useNovaAdaptBridgeMock.mockReset();
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
  useNovaAdaptBridgeMock.mockReturnValue({
    loading: false,
    refreshing: false,
    supported: false,
    runtimeAvailable: false,
    error: null,
    health: null,
    memoryStatus: null,
    plans: [],
    jobs: [],
    workflows: [],
    refresh: vi.fn(),
    createPlan: vi.fn(async () => null),
    startWorkflow: vi.fn(async () => null),
    resumeWorkflow: vi.fn(async () => true),
    approvePlanAsync: vi.fn(async () => true),
    rejectPlan: vi.fn(async () => true),
    retryFailedPlanAsync: vi.fn(async () => true),
    undoPlan: vi.fn(async () => true),
  });
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
          server: null,
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
          server: null,
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

  it("renders remote runtime plans and routes plan actions through the bridge", async () => {
    const approvePlanAsync = vi.fn(async () => true);
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      plans: [
        {
          id: "plan-1",
          objective: "Watch the cluster",
          status: "pending",
          createdAt: "2026-03-10T00:00:00.000Z",
          updatedAt: "2026-03-10T00:00:00.000Z",
          progressCompleted: 0,
          progressTotal: 3,
          executionError: null,
          rejectReason: null,
        },
      ],
      jobs: [],
      workflows: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync,
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          server: {
            id: "dgx",
            name: "DGX",
            baseUrl: "https://dgx.novaremote.test",
            token: "token",
            defaultCwd: "/workspace",
          },
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
        })
      );
    });

    expect(() => renderer.root.findByProps({ children: "Server Runtime" })).not.toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Approve plan plan-1" }).props.onPress();
    });

    expect(approvePlanAsync).toHaveBeenCalledWith("plan-1");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("creates server plans and workflows directly when screen mode has a live runtime", async () => {
    const createPlan = vi.fn(async () => ({
      id: "plan-remote",
      objective: "Watch the cluster",
      status: "pending",
      createdAt: "2026-03-10T04:00:00.000Z",
      updatedAt: "2026-03-10T04:00:00.000Z",
      progressCompleted: 0,
      progressTotal: 2,
      executionError: null,
      rejectReason: null,
    }));
    const startWorkflow = vi.fn(async () => ({
      workflowId: "wf-remote",
      objective: "Watch the cluster",
      status: "running",
      updatedAt: "2026-03-10T04:01:00.000Z",
      lastError: null,
    }));
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      plans: [],
      jobs: [],
      workflows: [],
      refresh: vi.fn(),
      createPlan,
      startWorkflow,
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          server: {
            id: "dgx",
            name: "DGX",
            baseUrl: "https://dgx.novaremote.test",
            token: "token",
            defaultCwd: "/workspace",
          },
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
          surface: "screen",
        })
      );
    });

    expect(useNovaAgentRuntimeMock).not.toHaveBeenCalled();

    const objectiveInput = renderer.root.findByProps({
      placeholder: "Objective (example: Watch cluster load and notify me)",
    });

    await act(async () => {
      objectiveInput.props.onChangeText("Watch the cluster");
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Create server approval plan" }).props.onPress();
    });

    expect(createPlan).toHaveBeenCalledWith("Watch the cluster", { strategy: "single" });

    await act(async () => {
      objectiveInput.props.onChangeText("Watch the cluster");
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Start server workflow" }).props.onPress();
    });

    expect(startWorkflow).toHaveBeenCalledWith("Watch the cluster", {
      autoResume: true,
      metadata: { capabilities: ["watch", "tool-calling"] },
    });

    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("keeps the terminals panel server-first without showing local preview when runtime is live", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      plans: [],
      jobs: [],
      workflows: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          server: {
            id: "dgx",
            name: "DGX",
            baseUrl: "https://dgx.novaremote.test",
            token: "token",
            defaultCwd: "/workspace",
          },
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
          surface: "panel",
        })
      );
    });

    expect(useNovaAgentRuntimeMock).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ children: "Create on Server" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("keeps the terminals panel server-first even when the bridge runtime is unavailable", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: false,
      error: "Runtime unavailable",
      health: { ok: false },
      memoryStatus: null,
      plans: [],
      jobs: [],
      workflows: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    const onOpenAgents = vi.fn();
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(NovaAgentPanel, {
          server: {
            id: "dgx",
            name: "DGX",
            baseUrl: "https://dgx.novaremote.test",
            token: "token",
            defaultCwd: "/workspace",
          },
          serverId: "dgx",
          serverName: "DGX",
          sessions: ["main"],
          isPro: true,
          onShowPaywall: vi.fn(),
          onQueueCommand: vi.fn(),
          onOpenAgents,
          surface: "panel",
        })
      );
    });

    expect(useNovaAgentRuntimeMock).not.toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).toThrow();
    expect(() => renderer.root.findByProps({ children: "Memory Timeline" })).toThrow();
    expect(() => renderer.root.findByProps({ children: "Runtime unavailable" })).not.toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Open Agents screen" }).props.onPress();
    });

    expect(onOpenAgents).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer.unmount();
    });
  });
});

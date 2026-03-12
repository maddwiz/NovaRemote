import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { useNovaAgentRuntimeMock } = vi.hoisted(() => ({
  useNovaAgentRuntimeMock: vi.fn(),
}));
const { useNovaAdaptBridgeMock } = vi.hoisted(() => ({
  useNovaAdaptBridgeMock: vi.fn(),
}));
const { openUrlMock } = vi.hoisted(() => ({
  openUrlMock: vi.fn(),
}));

vi.mock("react-native", async () => {
  const actual = await vi.importActual<typeof import("react-native")>("react-native");
  return {
    ...actual,
    Linking: {
      ...(actual.Linking ?? {}),
      openURL: openUrlMock,
    },
  };
});

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
  openUrlMock.mockReset();
  openUrlMock.mockResolvedValue(undefined);
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
    capabilities: {
      memoryStatus: false,
      governance: false,
      workflows: false,
      templates: false,
      templateGallery: false,
    },
    error: null,
    health: null,
    memoryStatus: null,
    governance: null,
    plans: [],
    jobs: [],
    workflows: [],
    templates: [],
    galleryTemplates: [],
    browserStatus: null,
    voiceStatus: null,
    canvasStatus: null,
    mobileStatus: null,
    homeAssistantStatus: null,
    mqttStatus: null,
    controlArtifacts: [],
    refresh: vi.fn(),
    createPlan: vi.fn(async () => null),
    startWorkflow: vi.fn(async () => null),
    importTemplate: vi.fn(async () => null),
    launchTemplate: vi.fn(async () => false),
    resumeWorkflow: vi.fn(async () => true),
    approvePlanAsync: vi.fn(async () => true),
    rejectPlan: vi.fn(async () => true),
    retryFailedPlanAsync: vi.fn(async () => true),
    undoPlan: vi.fn(async () => true),
    pauseRuntime: vi.fn(async () => true),
    resumeRuntime: vi.fn(async () => true),
    resetGovernanceUsage: vi.fn(async () => true),
    cancelAllJobs: vi.fn(async () => true),
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
    const pauseRuntime = vi.fn(async () => true);
    const resetGovernanceUsage = vi.fn(async () => true);
    const cancelAllJobs = vi.fn(async () => true);
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      capabilities: {
        memoryStatus: true,
        governance: true,
        workflows: true,
        templates: true,
        templateGallery: true,
        browserStatus: true,
        voiceStatus: true,
        canvasStatus: true,
        mobileStatus: true,
        homeAssistantStatus: true,
        mqttStatus: true,
        controlArtifacts: true,
      },
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: {
        paused: false,
        pauseReason: null,
        budgetLimitUsd: 4,
        maxActiveRuns: 2,
        activeRuns: 1,
        runsTotal: 3,
        llmCallsTotal: 9,
        spendEstimateUsd: 0.5,
        updatedAt: null,
        lastRunAt: null,
        lastObjectivePreview: "Watch the cluster",
        lastStrategy: "single",
        jobs: { active: 1, queued: 0, running: 1, maxWorkers: 2 },
      },
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
      templates: [],
      galleryTemplates: [],
      browserStatus: { ok: true, transport: "playwright", details: {} },
      voiceStatus: { ok: true, enabled: true, context: "api", details: {} },
      canvasStatus: { ok: true, enabled: true, context: "render", details: {} },
      mobileStatus: { ok: true, transport: "appium", platform: "ios", details: {} },
      homeAssistantStatus: { ok: true, configured: true, transport: "homeassistant", details: {} },
      mqttStatus: { ok: true, configured: true, transport: "mqtt", details: {} },
      controlArtifacts: [
        {
          artifactId: "artifact-1",
          createdAt: null,
          controlType: "vision",
          status: "completed",
          dangerous: false,
          goal: "Inspect logs",
          platform: "ios",
          transport: "appium",
          outputPreview: "Captured diagnostics",
          actionType: null,
          target: null,
          model: null,
          modelId: null,
          previewAvailable: true,
          previewPath: "/control/artifacts/artifact-1/preview",
          detailPath: "/control/artifacts/artifact-1",
        },
      ],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync,
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime,
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage,
      cancelAllJobs,
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
    expect(() => renderer.root.findByProps({ children: "Control Surfaces" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Control Artifacts" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Browser" })).not.toThrow();
    expect(renderer.root.findAllByProps({ children: "Inspect logs" }).length).toBeGreaterThan(0);

    expect(() => renderer.root.findByProps({ children: "Artifact Preview" })).not.toThrow();
    expect(renderer.root.findAllByProps({ children: "Captured diagnostics" }).length).toBeGreaterThan(0);

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Open preview url for artifact artifact-1" }).props.onPress();
    });

    expect(openUrlMock).toHaveBeenNthCalledWith(
      1,
      "https://dgx.novaremote.test/control/artifacts/artifact-1/preview"
    );

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Show details for artifact artifact-1" }).props.onPress();
    });

    expect(() => renderer.root.findByProps({ children: "Artifact Details" })).not.toThrow();
    expect(() =>
      renderer.root.findByProps({ children: "No additional detail fields were returned for this artifact." })
    ).not.toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Open detail url for artifact artifact-1" }).props.onPress();
    });

    expect(openUrlMock).toHaveBeenNthCalledWith(
      2,
      "https://dgx.novaremote.test/control/artifacts/artifact-1"
    );

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Approve plan plan-1" }).props.onPress();
    });

    expect(approvePlanAsync).toHaveBeenCalledWith("plan-1");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Pause runtime governance" }).props.onPress();
      renderer.root.findByProps({ accessibilityLabel: "Reset runtime governance usage" }).props.onPress();
      renderer.root.findByProps({ accessibilityLabel: "Cancel all runtime jobs" }).props.onPress();
    });

    expect(pauseRuntime).toHaveBeenCalledWith("Paused from NovaRemote mobile panel");
    expect(resetGovernanceUsage).toHaveBeenCalledTimes(1);
    expect(cancelAllJobs).toHaveBeenCalledWith("Canceled from NovaRemote mobile panel");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("shows a compatibility warning when the companion protocol drifts", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      capabilities: {
        protocolVersion: "2026-03-10.0",
        agentContractVersion: "2026-03-10.0",
        memoryStatus: true,
        governance: true,
        workflows: true,
        templates: true,
        templateGallery: true,
      },
      error: null,
      health: {
        ok: true,
        protocolVersion: "2026-03-10.0",
        agentContractVersion: "2026-03-10.0",
      },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

    expect(() =>
      renderer.root.findByProps({ children: "Companion update recommended: protocol 2026-03-10.0 • agent contract 2026-03-10.0" })
    ).not.toThrow();

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
      capabilities: {
        memoryStatus: true,
        governance: true,
        workflows: true,
        templates: true,
        templateGallery: true,
      },
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: {
        paused: false,
        pauseReason: null,
        budgetLimitUsd: null,
        maxActiveRuns: null,
        activeRuns: 0,
        runsTotal: 0,
        llmCallsTotal: 0,
        spendEstimateUsd: 0,
        updatedAt: null,
        lastRunAt: null,
        lastObjectivePreview: null,
        lastStrategy: null,
        jobs: { active: 0, queued: 0, running: 0, maxWorkers: 2 },
      },
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan,
      startWorkflow,
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

  it("disables workflow actions when the companion does not expose workflows", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      capabilities: {
        memoryStatus: true,
        governance: true,
        workflows: false,
        templates: true,
        templateGallery: true,
      },
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [
        {
          templateId: "saved-1",
          name: "Saved Ops Template",
          description: "Saved template",
          objective: "Saved objective",
          strategy: "single",
          source: "saved",
          tags: [],
        },
      ],
      galleryTemplates: [
        {
          templateId: "gallery-1",
          name: "Gallery Ops Template",
          description: "Gallery template",
          objective: "Gallery objective",
          strategy: "single",
          source: "gallery",
          tags: [],
        },
      ],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

    const objectiveInput = renderer.root.findByProps({
      placeholder: "Objective (example: Watch cluster load and notify me)",
    });

    await act(async () => {
      objectiveInput.props.onChangeText("Watch the cluster");
    });

    const startWorkflowButton = renderer.root.findByProps({ accessibilityLabel: "Start server workflow" });
    expect(startWorkflowButton.props.disabled).toBe(true);
    expect(() => renderer.root.findByProps({ children: "This companion runtime does not expose workflow creation yet." })).not.toThrow();

    const launchWorkflowButton = renderer.root.findByProps({
      accessibilityLabel: "Launch Saved Ops Template as workflow",
    });
    expect(launchWorkflowButton.props.disabled).toBe(true);

    const importWorkflowButton = renderer.root.findByProps({
      accessibilityLabel: "Import and launch Gallery Ops Template as workflow",
    });
    expect(importWorkflowButton.props.disabled).toBe(true);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("keeps local fallback hidden on the dedicated screen until explicitly enabled", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: false,
      capabilities: {
        memoryStatus: false,
        governance: false,
        workflows: false,
        templates: false,
        templateGallery: false,
      },
      error: "Runtime unavailable",
      health: { ok: false },
      memoryStatus: null,
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).toThrow();
    expect(() => renderer.root.findByProps({ children: "Enable Device Fallback" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Companion capabilities unavailable." })).not.toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Enable device fallback controls" }).props.onPress();
    });

    expect(useNovaAgentRuntimeMock).toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).not.toThrow();

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
      capabilities: {
        memoryStatus: true,
        governance: true,
        workflows: true,
        templates: true,
        templateGallery: true,
      },
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

  it("auto-enables device fallback on the dedicated screen when requested", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: false,
      runtimeAvailable: false,
      capabilities: {
        memoryStatus: false,
        governance: false,
        workflows: false,
        templates: false,
        templateGallery: false,
      },
      error: "Runtime unavailable",
      health: { ok: false },
      memoryStatus: null,
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
    });
    const handled = vi.fn();

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
          autoEnableLocalFallback: true,
          onAutoEnableLocalFallbackHandled: handled,
          surface: "screen",
        })
      );
    });

    expect(handled).toHaveBeenCalledTimes(1);
    expect(useNovaAgentRuntimeMock).toHaveBeenCalled();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Add NovaAdapt agent" })).not.toThrow();

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
      capabilities: {
        memoryStatus: false,
        governance: false,
        workflows: false,
        templates: false,
        templateGallery: false,
      },
      error: "Runtime unavailable",
      health: { ok: false },
      memoryStatus: null,
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

  it("renders saved and gallery templates and routes launches through the bridge", async () => {
    const importTemplate = vi.fn(async (template) => ({
      ...template,
      source: "local",
    }));
    const launchTemplate = vi.fn(async () => true);
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      capabilities: {
        memoryStatus: true,
        governance: true,
        workflows: true,
        templates: true,
        templateGallery: true,
      },
      error: null,
      health: { ok: true },
      memoryStatus: { backend: "novaspine-http", enabled: true },
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [
        {
          templateId: "saved-1",
          name: "Saved Watch",
          description: "Saved template",
          objective: "Watch the cluster",
          strategy: "single",
          candidates: [],
          tags: ["ops"],
          source: "local",
          shared: false,
          shareToken: null,
          createdAt: null,
          updatedAt: null,
          metadata: {},
          steps: [{ name: "watch", objective: "Watch the cluster" }],
        },
      ],
      galleryTemplates: [
        {
          templateId: "gallery-1",
          name: "Gallery Watch",
          description: "Gallery template",
          objective: "Watch deploys",
          strategy: "single",
          candidates: [],
          tags: ["deploy"],
          source: "gallery",
          shared: false,
          shareToken: null,
          createdAt: null,
          updatedAt: null,
          metadata: {},
          steps: [{ name: "watch", objective: "Watch deploys" }],
        },
      ],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate,
      launchTemplate,
      resumeWorkflow: vi.fn(async () => true),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => true),
      resumeRuntime: vi.fn(async () => true),
      resetGovernanceUsage: vi.fn(async () => true),
      cancelAllJobs: vi.fn(async () => true),
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

    expect(() => renderer.root.findByProps({ children: "Saved Templates" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Template Gallery" })).not.toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Launch Saved Watch as approval plan" }).props.onPress();
    });
    expect(importTemplate).not.toHaveBeenCalled();
    expect(launchTemplate).toHaveBeenCalledWith("saved-1", { mode: "plan" });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Import and launch Gallery Watch as workflow" }).props.onPress();
    });
    expect(importTemplate).toHaveBeenCalledWith(expect.objectContaining({ templateId: "gallery-1" }));
    expect(launchTemplate).toHaveBeenCalledWith("gallery-1", { mode: "workflow" });

    await act(async () => {
      renderer.unmount();
    });
  });

  it("shows bridge-mismatch notices when optional runtime routes are unavailable", async () => {
    useNovaAdaptBridgeMock.mockReturnValue({
      loading: false,
      refreshing: false,
      supported: true,
      runtimeAvailable: true,
      capabilities: {
        memoryStatus: false,
        governance: false,
        workflows: false,
        templates: false,
        templateGallery: false,
      },
      error: null,
      health: { ok: true },
      memoryStatus: null,
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      refresh: vi.fn(),
      createPlan: vi.fn(async () => null),
      startWorkflow: vi.fn(async () => null),
      importTemplate: vi.fn(async () => null),
      launchTemplate: vi.fn(async () => false),
      resumeWorkflow: vi.fn(async () => false),
      approvePlanAsync: vi.fn(async () => true),
      rejectPlan: vi.fn(async () => true),
      retryFailedPlanAsync: vi.fn(async () => true),
      undoPlan: vi.fn(async () => true),
      pauseRuntime: vi.fn(async () => false),
      resumeRuntime: vi.fn(async () => false),
      resetGovernanceUsage: vi.fn(async () => false),
      cancelAllJobs: vi.fn(async () => false),
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

    expect(() => renderer.root.findByProps({ children: "Memory status unavailable on this runtime." })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "This server runtime does not expose governance controls yet." })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "This server runtime does not expose workflow controls yet." })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "This bridge does not expose saved template routes yet." })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "This bridge does not expose gallery import routes yet." })).not.toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });
});

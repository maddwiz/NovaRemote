import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VrGestureEvent } from "../inputGestures";
import { useVrInputRouter, UseVrInputRouterResult } from "../useVrInputRouter";
import { VrWorkspaceGestureAction, VrWorkspaceVoiceAction } from "../useVrWorkspace";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (
      joined.includes("react-test-renderer is deprecated") ||
      joined.includes("The current testing environment is not configured to support act")
    ) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("useVrInputRouter", () => {
  it("dispatches voice send actions and reports success in HUD state", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({
      kind: "send",
      panelId: "dgx::main",
      serverId: "dgx",
      session: "main",
      command: "npm test",
    }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onSendCommand = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("send to dgx: npm test");
    });

    expect(applyVoiceTranscript).toHaveBeenCalledWith("send to dgx: npm test", {
      targetPanelId: null,
    });
    expect(onSendCommand).toHaveBeenCalledWith("dgx", "main", "npm test");
    expect(current().hudStatus?.severity).toBe("success");
    expect(current().hudStatus?.message).toContain("Sent to dgx/main");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("passes gaze target panel routing through dispatchVoice options", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({
      kind: "send",
      panelId: "home::build",
      serverId: "home",
      session: "build",
      command: "npm run build",
    }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onSendCommand = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("npm run build", { targetPanelId: "home::build" });
    });

    expect(applyVoiceTranscript).toHaveBeenCalledWith("npm run build", {
      targetPanelId: "home::build",
    });
    expect(onSendCommand).toHaveBeenCalledWith("home", "build", "npm run build");
    expect(current().hudStatus?.message).toContain("Sent to home/build");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches control-char voice actions through the control callback", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({
      kind: "control",
      panelId: "home::build",
      serverId: "home",
      session: "build",
      char: "C-c",
    }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onSendControlChar = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onSendControlChar,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("interrupt for homelab");
    });

    expect(onSendControlChar).toHaveBeenCalledWith("home", "build", "C-c");
    expect(current().hudStatus?.message).toContain("Sent C-c to home/build");
    expect(current().hudStatus?.severity).toBe("success");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches stop-session, open-on-mac, and live-share voice actions through lifecycle callbacks", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({
        kind: "stop_session",
        panelId: "home::build",
        serverId: "home",
        session: "build",
      })
      .mockReturnValueOnce({
        kind: "open_on_mac",
        panelId: "home::build",
        serverId: "home",
        session: "build",
      })
      .mockReturnValueOnce({
        kind: "share_live",
        panelId: "home::build",
        serverId: "home",
        session: "build",
      });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onStopSession = vi.fn(async () => undefined);
    const onOpenOnMac = vi.fn(async () => undefined);
    const onShareLive = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onStopSession,
        onOpenOnMac,
        onShareLive,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("stop session");
    });
    expect(onStopSession).toHaveBeenCalledWith("home", "build");
    expect(current().hudStatus?.message).toContain("Stopped home/build");

    await act(async () => {
      await current().dispatchVoice("open on mac");
    });
    expect(onOpenOnMac).toHaveBeenCalledWith("home", "build");
    expect(current().hudStatus?.message).toContain("Opened home/build on Mac");

    await act(async () => {
      await current().dispatchVoice("share live");
    });
    expect(onShareLive).toHaveBeenCalledWith("home", "build");
    expect(current().hudStatus?.message).toContain("Shared live link for home/build");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches reconnect actions through reconnect callbacks", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({
        kind: "reconnect_server",
        panelId: "home::build",
        serverId: "home",
      })
      .mockReturnValueOnce({
        kind: "reconnect_all",
        serverIds: ["dgx", "home"],
      });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onReconnectServer = vi.fn(async () => undefined);
    const onReconnectServers = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onReconnectServer,
        onReconnectServers,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("reconnect homelab");
    });
    expect(onReconnectServer).toHaveBeenCalledWith("home");
    expect(current().hudStatus?.message).toContain("Reconnect queued for home");

    await act(async () => {
      await current().dispatchVoice("reconnect all");
    });
    expect(onReconnectServers).toHaveBeenCalledWith(["dgx", "home"]);
    expect(current().hudStatus?.message).toContain("Reconnect queued for 2 servers");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches agent approval voice actions through approval callbacks", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({
        kind: "approve_ready_agents",
        serverIds: ["dgx", "home"],
      })
      .mockReturnValueOnce({
        kind: "deny_all_pending_agents",
        serverIds: ["dgx", "home"],
      });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onApproveReadyAgents = vi.fn(async () => ["agent-a", "agent-b"]);
    const onDenyAllPendingAgents = vi.fn(async () => ["agent-a"]);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onApproveReadyAgents,
        onDenyAllPendingAgents,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("approve ready agents");
    });
    expect(onApproveReadyAgents).toHaveBeenCalledWith(["dgx", "home"]);
    expect(current().hudStatus?.message).toContain("Approved 2 ready agent approvals");

    await act(async () => {
      await current().dispatchVoice("deny all pending agents");
    });
    expect(onDenyAllPendingAgents).toHaveBeenCalledWith(["dgx", "home"]);
    expect(current().hudStatus?.message).toContain("Denied 1 pending agent approval");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches agent lifecycle voice actions through creation and goal callbacks", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({
        kind: "create_agent",
        serverIds: ["dgx"],
        name: "build watcher",
      })
      .mockReturnValueOnce({
        kind: "create_agent",
        serverIds: ["dgx", "home"],
        name: "deploy bot",
      })
      .mockReturnValueOnce({
        kind: "set_agent_goal",
        serverIds: ["dgx"],
        name: "build watcher",
        goal: "npm run test",
      })
      .mockReturnValueOnce({
        kind: "set_agent_goal",
        serverIds: ["dgx", "home"],
        name: "deploy bot",
        goal: "npm run deploy",
      })
      .mockReturnValueOnce({
        kind: "queue_agent_command",
        serverIds: ["dgx"],
        name: "build watcher",
        command: "npm run test",
      })
      .mockReturnValueOnce({
        kind: "queue_agent_command",
        serverIds: ["dgx", "home"],
        name: "deploy bot",
        command: "npm run deploy",
      });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onCreateAgent = vi
      .fn<(serverIds: string[], name: string) => Promise<boolean | number>>()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(2);
    const onSetAgentGoal = vi
      .fn<(serverIds: string[], name: string, goal: string) => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);
    const onQueueAgentCommand = vi
      .fn<(serverIds: string[], name: string, command: string) => Promise<number>>()
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(2);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onCreateAgent,
        onSetAgentGoal,
        onQueueAgentCommand,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("create agent build watcher");
    });
    expect(onCreateAgent).toHaveBeenCalledWith(["dgx"], "build watcher");
    expect(current().hudStatus?.message).toContain("Created 1 agent named build watcher");

    await act(async () => {
      await current().dispatchVoice("create agent deploy bot for all servers");
    });
    expect(onCreateAgent).toHaveBeenCalledWith(["dgx", "home"], "deploy bot");
    expect(current().hudStatus?.message).toContain("Created 2 agents named deploy bot");

    await act(async () => {
      await current().dispatchVoice("set agent build watcher goal npm run test");
    });
    expect(onSetAgentGoal).toHaveBeenCalledWith(["dgx"], "build watcher", "npm run test");
    expect(current().hudStatus?.message).toContain("Updated goal for 1 agent");

    await act(async () => {
      await current().dispatchVoice("set agent deploy bot goal npm run deploy for all servers");
    });
    expect(onSetAgentGoal).toHaveBeenCalledWith(["dgx", "home"], "deploy bot", "npm run deploy");
    expect(current().hudStatus?.message).toContain("Updated goal for 2 agents");

    await act(async () => {
      await current().dispatchVoice("agent build watcher run npm run test");
    });
    expect(onQueueAgentCommand).toHaveBeenCalledWith(["dgx"], "build watcher", "npm run test");
    expect(current().hudStatus?.message).toContain("Queued 1 pending approval for build watcher");

    await act(async () => {
      await current().dispatchVoice("agent deploy bot run npm run deploy for all servers");
    });
    expect(onQueueAgentCommand).toHaveBeenCalledWith(["dgx", "home"], "deploy bot", "npm run deploy");
    expect(current().hudStatus?.message).toContain("Queued 2 pending approvals for deploy bot");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches pool lifecycle voice actions through connect/disconnect callbacks", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({ kind: "pause_pool" })
      .mockReturnValueOnce({ kind: "resume_pool" });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onDisconnectAllServers = vi.fn(async () => undefined);
    const onConnectAllServers = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onDisconnectAllServers,
        onConnectAllServers,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("pause pool");
    });
    expect(onDisconnectAllServers).toHaveBeenCalledTimes(1);
    expect(current().hudStatus?.message).toContain("Connection pool paused");

    await act(async () => {
      await current().dispatchVoice("resume pool");
    });
    expect(onConnectAllServers).toHaveBeenCalledTimes(1);
    expect(current().hudStatus?.message).toContain("Connection pool resumed");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("toggles overview mode from voice and gesture actions", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({ kind: "overview" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "overview" }));
    const onSetOverviewMode = vi.fn();

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onSetOverviewMode,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("show all panels");
    });
    expect(onSetOverviewMode).toHaveBeenCalledWith(true);

    await act(async () => {
      current().dispatchGesture({ kind: "spread_overview" });
    });
    expect(onSetOverviewMode).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("calls workspace.setOverviewMode(false) for minimize voice actions", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({ kind: "minimize" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const setOverviewMode = vi.fn();

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture, setOverviewMode },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("focus mode");
    });

    expect(setOverviewMode).toHaveBeenCalledWith(false);
    expect(current().hudStatus?.message).toContain("Focus mode");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("publishes HUD updates for panel visual voice actions", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({ kind: "panel_mini", panelId: "dgx::main" })
      .mockReturnValueOnce({ kind: "panel_expand", panelId: "dgx::main" })
      .mockReturnValueOnce({ kind: "panel_opacity", panelId: "dgx::main", opacity: 0.45 });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("mini panel");
    });
    expect(current().hudStatus?.message).toContain("Mini panel dgx::main");

    await act(async () => {
      await current().dispatchVoice("expand panel");
    });
    expect(current().hudStatus?.message).toContain("Expanded panel dgx::main");

    await act(async () => {
      await current().dispatchVoice("opacity 45%");
    });
    expect(current().hudStatus?.message).toContain("Panel opacity 45%");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("publishes HUD updates for layout preset voice actions", async () => {
    const applyVoiceTranscript = vi
      .fn<(transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction>()
      .mockReturnValueOnce({ kind: "layout_preset", preset: "grid" });
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("layout grid");
    });
    expect(current().hudStatus?.message).toContain("Layout preset grid");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("records rotate HUD status for gesture rotation actions", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({ kind: "none" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({
      kind: "rotate_workspace",
      direction: "left",
    }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().dispatchGesture({ kind: "fist_pull_rotate", direction: "left" });
    });

    expect(current().hudStatus?.message).toContain("Rotated workspace left");
    expect(current().hudStatus?.severity).toBe("info");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("records snap layout HUD status for gesture layout actions", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({ kind: "none" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({
      kind: "snap_layout",
      preset: "grid",
    }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().dispatchGesture({ kind: "snap_layout", preset: "grid" });
    });

    expect(current().hudStatus?.message).toContain("Snapped layout grid");
    expect(current().hudStatus?.severity).toBe("info");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("dispatches gesture agent approval actions through approval callbacks", async () => {
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({ kind: "none" }));
    const applyGesture = vi
      .fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>()
      .mockReturnValueOnce({ kind: "approve_ready_agents", serverIds: ["dgx"] })
      .mockReturnValueOnce({ kind: "deny_all_pending_agents", serverIds: ["dgx", "home"] });
    const onApproveReadyAgents = vi.fn(async () => ["agent-a"]);
    const onDenyAllPendingAgents = vi.fn(async () => ["agent-a", "agent-b"]);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onApproveReadyAgents,
        onDenyAllPendingAgents,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().dispatchGesture({ kind: "approve_agents", scope: "focused" });
      await Promise.resolve();
    });
    expect(onApproveReadyAgents).toHaveBeenCalledWith(["dgx"]);
    expect(current().hudStatus?.message).toContain("Approved 1 ready agent approval");

    await act(async () => {
      current().dispatchGesture({ kind: "deny_agents", scope: "all" });
      await Promise.resolve();
    });
    expect(onDenyAllPendingAgents).toHaveBeenCalledWith(["dgx", "home"]);
    expect(current().hudStatus?.message).toContain("Denied 2 pending agent approvals");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("auto-clears HUD status after the configured timeout", async () => {
    vi.useFakeTimers();
    const applyVoiceTranscript = vi.fn<
      (transcript: string, options?: { targetPanelId?: string | null }) => VrWorkspaceVoiceAction
    >(() => ({
      kind: "send",
      panelId: "dgx::main",
      serverId: "dgx",
      session: "main",
      command: "echo ok",
    }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        hudAutoClearMs: 500,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("send to dgx: echo ok");
    });
    expect(current().hudStatus?.message).toContain("Sent to dgx/main");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });
    expect(current().hudStatus).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
  });
});

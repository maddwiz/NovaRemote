import React from "react";
import * as SecureStore from "expo-secure-store";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCapabilities, ServerConnection, ServerProfile } from "../../types";
import { buildVrPanelId, useVrWorkspace, UseVrWorkspaceResult, vrWorkspaceTestUtils } from "../useVrWorkspace";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../../constants", () => ({
  STORAGE_VR_WORKSPACE_PREFIX: "novaremote.vr_workspace.v1",
}));

const CAPABILITIES: ServerCapabilities = {
  terminal: true,
  tmux: true,
  codex: false,
  files: false,
  shellRun: false,
  macAttach: false,
  stream: true,
  sysStats: false,
  processes: false,
  collaboration: false,
  spectate: false,
};

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(server: ServerProfile, sessions: string[], tails: Record<string, string> = {}): ServerConnection {
  return {
    server,
    connected: true,
    capabilities: CAPABILITIES,
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: sessions,
    localAiSessions: [],
    openSessions: sessions,
    tails,
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: sessions.length,
      openSessions: sessions.length,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: sessions.length,
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;
const getItemAsyncMock = vi.mocked(SecureStore.getItemAsync);
const setItemAsyncMock = vi.mocked(SecureStore.setItemAsync);

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  getItemAsyncMock.mockResolvedValue(null);
  setItemAsyncMock.mockResolvedValue(undefined);
  getItemAsyncMock.mockClear();
  setItemAsyncMock.mockClear();
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("vrWorkspaceTestUtils", () => {
  it("rotates panel id order", () => {
    expect(vrWorkspaceTestUtils.rotateOrder(["a", "b", "c"], "left")).toEqual(["b", "c", "a"]);
    expect(vrWorkspaceTestUtils.rotateOrder(["a", "b", "c"], "right")).toEqual(["c", "a", "b"]);
  });

  it("keeps pinned panels when enforcing limits", () => {
    expect(vrWorkspaceTestUtils.applyPanelLimit(["a", "b", "c"], ["c"], 2)).toEqual(["c", "a"]);
    expect(vrWorkspaceTestUtils.applyPanelLimit(["a", "b", "c"], ["a"], 2)).toEqual(["a", "b"]);
  });
});

describe("useVrWorkspace", () => {
  it("builds a panel list from multi-server connections and enforces max panels", async () => {
    const dgx = makeServer("dgx", "DGX");
    const homelab = makeServer("home", "Homelab");

    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "logs"])],
      [homelab.id, makeConnection(homelab, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 2, initialPreset: "grid" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().panels).toHaveLength(2);
    expect(current().panels.map((panel) => panel.id)).toEqual([
      buildVrPanelId("dgx", "main"),
      buildVrPanelId("dgx", "logs"),
    ]);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes voice commands to the target server/session", async () => {
    const dgx = makeServer("dgx", "DGX Spark");
    const homelab = makeServer("home", "Homelab");

    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"], { main: "ready" })],
      [homelab.id, makeConnection(homelab, ["build-01"], { "build-01": "running" })],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4 });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const action = current().applyVoiceTranscript("send to homelab: npm run build");
    expect(action).toEqual({
      kind: "send",
      panelId: buildVrPanelId("home", "build-01"),
      serverId: "home",
      session: "build-01",
      command: "npm run build",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes unrouted voice transcripts to an explicit target panel without focus switch", async () => {
    const dgx = makeServer("dgx", "DGX Spark");
    const homelab = makeServer("home", "Homelab");

    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"], { main: "ready" })],
      [homelab.id, makeConnection(homelab, ["build-01"], { "build-01": "running" })],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4 });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().focusedPanelId).toBe(buildVrPanelId("dgx", "main"));

    const action = current().applyVoiceTranscript("npm run build", {
      targetPanelId: buildVrPanelId("home", "build-01"),
    });
    expect(action).toEqual({
      kind: "send",
      panelId: buildVrPanelId("home", "build-01"),
      serverId: "home",
      session: "build-01",
      command: "npm run build",
    });
    expect(current().focusedPanelId).toBe(buildVrPanelId("dgx", "main"));

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("rotates visible panel order", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Homelab");

    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "logs"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 3 });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const before = current().panels.map((panel) => panel.id);

    await act(async () => {
      current().rotateWorkspace("left");
    });

    const after = current().panels.map((panel) => panel.id);
    expect(after).toEqual(vrWorkspaceTestUtils.rotateOrder(before, "left"));

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("switches to custom preset when panel transforms are edited", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 3, initialPreset: "arc" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const panelId = buildVrPanelId("dgx", "main");
    await act(async () => {
      current().updatePanelTransform(panelId, { x: 1.2, y: 1.9, yaw: 14 });
    });

    expect(current().preset).toBe("custom");
    const panel = current().panels.find((entry) => entry.id === panelId);
    expect(panel?.transform.x).toBe(1.2);
    expect(panel?.transform.y).toBe(1.9);
    expect(panel?.transform.yaw).toBe(14);

    const snapshot = current().exportSnapshot();
    expect(snapshot.preset).toBe("custom");
    expect(snapshot.customTransforms?.[panelId]?.x).toBe(1.2);
    expect(snapshot.customTransforms?.[panelId]?.yaw).toBe(14);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("restores custom snapshots with panel order, focus, pins, and transforms", async () => {
    const dgx = makeServer("dgx", "DGX Spark");
    const homelab = makeServer("home", "Homelab");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [homelab.id, makeConnection(homelab, ["build-01"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4, initialPreset: "grid" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const homePanel = buildVrPanelId("home", "build-01");
    const dgxPanel = buildVrPanelId("dgx", "main");

    await act(async () => {
      current().restoreSnapshot({
        version: "1.0.0",
        preset: "custom",
        focusedPanelId: homePanel,
        panelIds: [homePanel, dgxPanel, "extra::session"],
        pinnedPanelIds: [homePanel],
        panelVisuals: {
          [homePanel]: { mini: true, opacity: 0.55 },
        },
        customTransforms: {
          [homePanel]: { x: 0.4, y: 1.82, z: -1.5, yaw: 18, width: 1.3, height: 0.75 },
        },
      });
    });

    expect(current().preset).toBe("custom");
    expect(current().focusedPanelId).toBe(homePanel);
    expect(current().panels.map((panel) => panel.id)).toEqual([homePanel, dgxPanel]);
    expect(current().panels.find((panel) => panel.id === homePanel)?.pinned).toBe(true);
    expect(current().panels.find((panel) => panel.id === homePanel)?.transform).toMatchObject({
      x: 0.4,
      y: 1.82,
      z: -1.5,
      yaw: 18,
      width: 1.3,
      height: 0.75,
    });
    expect(current().panels.find((panel) => panel.id === homePanel)?.mini).toBe(true);
    expect(current().panels.find((panel) => panel.id === homePanel)?.opacity).toBeCloseTo(0.55);

    const exported = current().exportSnapshot();
    expect(exported.panelIds).toEqual([homePanel, dgxPanel]);
    expect(exported.focusedPanelId).toBe(homePanel);
    expect(exported.pinnedPanelIds).toEqual([homePanel]);
    expect(exported.panelVisuals?.[homePanel]).toEqual({ mini: true, opacity: 0.55 });
    expect(exported.customTransforms?.[homePanel]?.x).toBe(0.4);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("preserves pinned panels when adding beyond limit", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "logs"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 2, initialPreset: "grid" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const mainPanel = buildVrPanelId("dgx", "main");
    const buildPanel = buildVrPanelId("home", "build");
    expect(current().panels.map((panel) => panel.id)).toEqual([mainPanel, buildVrPanelId("dgx", "logs")]);

    await act(async () => {
      current().togglePinPanel(mainPanel);
    });

    await act(async () => {
      current().addPanel("home", "build");
    });

    expect(current().panels.map((panel) => panel.id)).toEqual([mainPanel, buildPanel]);
    expect(current().panels.find((panel) => panel.id === mainPanel)?.pinned).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("hydrates workspace state from persisted snapshot preferences", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Homelab");
    const dgxPanel = buildVrPanelId("dgx", "main");
    const homePanel = buildVrPanelId("home", "build");

    getItemAsyncMock.mockResolvedValueOnce(
      JSON.stringify({
        version: "1.0.0",
        preset: "custom",
        focusedPanelId: homePanel,
        panelIds: [homePanel, dgxPanel],
        pinnedPanelIds: [homePanel],
        customTransforms: {
          [homePanel]: { x: 0.8, y: 1.7, z: -1.6, yaw: 22 },
        },
      })
    );

    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4, initialPreset: "arc" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().preset).toBe("custom");
    expect(current().focusedPanelId).toBe(homePanel);
    expect(current().panels.map((panel) => panel.id)).toEqual([homePanel, dgxPanel]);
    expect(current().panels.find((panel) => panel.id === homePanel)?.pinned).toBe(true);
    expect(current().panels.find((panel) => panel.id === homePanel)?.transform.yaw).toBe(22);
    expect(getItemAsyncMock).toHaveBeenCalledTimes(1);
    const persistedPayloads = setItemAsyncMock.mock.calls.map((call) => JSON.parse(String(call[1])) as { panelIds: string[] });
    const staleWrite = persistedPayloads.some((payload) => payload.panelIds[0] === dgxPanel);
    expect(staleWrite).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("applies gestures to move, resize, and rotate panels", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4, initialPreset: "grid" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const dgxPanel = buildVrPanelId("dgx", "main");
    const firstOrder = current().panels.map((panel) => panel.id);

    await act(async () => {
      const focusAction = current().applyGesture({ kind: "point_trigger", panelId: dgxPanel });
      expect(focusAction).toEqual({ kind: "focus", panelId: dgxPanel });
    });
    expect(current().focusedPanelId).toBe(dgxPanel);

    await act(async () => {
      const moveAction = current().applyGesture({ kind: "grab_move", panelId: dgxPanel, deltaX: 0.4, deltaYaw: 9 });
      expect(moveAction.kind).toBe("move");
    });
    expect(current().preset).toBe("custom");
    expect(current().panels.find((panel) => panel.id === dgxPanel)?.transform.x).toBeCloseTo(0.4);
    expect(current().panels.find((panel) => panel.id === dgxPanel)?.transform.yaw).toBeCloseTo(9);

    await act(async () => {
      const resizeAction = current().applyGesture({ kind: "pinch_resize", panelId: dgxPanel, scale: 1.2 });
      expect(resizeAction.kind).toBe("resize");
    });
    expect((current().panels.find((panel) => panel.id === dgxPanel)?.transform.width || 0) > 1.0).toBe(true);

    await act(async () => {
      const rotateAction = current().applyGesture({ kind: "fist_pull_rotate", direction: "left" });
      expect(rotateAction).toEqual({ kind: "rotate_workspace", direction: "left" });
    });
    const rotatedOrder = current().panels.map((panel) => panel.id);
    expect(rotatedOrder).toEqual(vrWorkspaceTestUtils.rotateOrder(firstOrder, "left"));

    await act(async () => {
      const snapAction = current().applyGesture({ kind: "snap_layout", preset: "grid" });
      expect(snapAction).toEqual({ kind: "snap_layout", preset: "grid" });
    });
    expect(current().preset).toBe("grid");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates panel mini mode and opacity with clamping", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 3, initialPreset: "arc" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const panelId = buildVrPanelId("dgx", "main");
    expect(current().panels.find((panel) => panel.id === panelId)?.mini).toBe(false);
    expect(current().panels.find((panel) => panel.id === panelId)?.opacity).toBe(1);

    await act(async () => {
      current().toggleMiniPanel(panelId);
      current().setPanelOpacity(panelId, 0.05);
    });

    const panel = current().panels.find((entry) => entry.id === panelId);
    expect(panel?.mini).toBe(true);
    expect(panel?.opacity).toBe(0.2);

    const snapshot = current().exportSnapshot();
    expect(snapshot.panelVisuals?.[panelId]).toEqual({ mini: true, opacity: 0.2 });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("applies voice commands for panel visual controls", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 3, initialPreset: "arc" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    const panelId = buildVrPanelId("dgx", "main");

    await act(async () => {
      const action = current().applyVoiceTranscript("mini panel");
      expect(action).toEqual({ kind: "panel_mini", panelId });
    });
    expect(current().panels.find((panel) => panel.id === panelId)?.mini).toBe(true);

    await act(async () => {
      const action = current().applyVoiceTranscript("opacity 35%");
      expect(action).toEqual({ kind: "panel_opacity", panelId, opacity: 0.35 });
    });
    expect(current().panels.find((panel) => panel.id === panelId)?.opacity).toBe(0.35);

    await act(async () => {
      const action = current().applyVoiceTranscript("opacity 1%");
      expect(action).toEqual({ kind: "panel_opacity", panelId, opacity: 0.2 });
    });
    expect(current().panels.find((panel) => panel.id === panelId)?.opacity).toBe(0.2);

    await act(async () => {
      const action = current().applyVoiceTranscript("expand panel");
      expect(action).toEqual({ kind: "panel_expand", panelId });
    });
    expect(current().panels.find((panel) => panel.id === panelId)?.mini).toBe(false);

    await act(async () => {
      const action = current().applyVoiceTranscript("mini for dgx");
      expect(action).toEqual({ kind: "panel_mini", panelId });
    });
    expect(current().panels.find((panel) => panel.id === panelId)?.mini).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("toggles overview mode from voice and gesture inputs", async () => {
    const dgx = makeServer("dgx", "DGX");
    const home = makeServer("home", "Home");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main"])],
      [home.id, makeConnection(home, ["build"])],
    ]);

    let latest: UseVrWorkspaceResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Workspace not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVrWorkspace({ connections, maxPanels: 4, initialPreset: "arc" });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().overviewMode).toBe(false);

    await act(async () => {
      const action = current().applyVoiceTranscript("show all panels");
      expect(action).toEqual({ kind: "overview" });
    });
    expect(current().overviewMode).toBe(true);

    await act(async () => {
      const action = current().applyVoiceTranscript("focus mode");
      expect(action).toEqual({ kind: "minimize" });
    });
    expect(current().overviewMode).toBe(false);

    await act(async () => {
      current().applyGesture({ kind: "spread_overview" });
    });
    expect(current().overviewMode).toBe(true);

    const snapshot = current().exportSnapshot();
    expect(snapshot.overviewMode).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCapabilities, ServerConnection, ServerProfile } from "../../types";
import { buildVrPanelId, useVrWorkspace, UseVrWorkspaceResult, vrWorkspaceTestUtils } from "../useVrWorkspace";

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

beforeEach(() => {
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

describe("vrWorkspaceTestUtils", () => {
  it("rotates panel id order", () => {
    expect(vrWorkspaceTestUtils.rotateOrder(["a", "b", "c"], "left")).toEqual(["b", "c", "a"]);
    expect(vrWorkspaceTestUtils.rotateOrder(["a", "b", "c"], "right")).toEqual(["c", "a", "b"]);
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
});

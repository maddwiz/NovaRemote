import { describe, expect, it, vi } from "vitest";

import { ServerConnection, ServerProfile } from "./types";
import {
  buildServerSwitcherMenuActions,
  formatServerDetails,
  groupServersByVmHost,
} from "./serverSwitcherRailModel";

function makeServer(overrides: Partial<ServerProfile>): ServerProfile {
  return {
    id: "server",
    name: "Server",
    baseUrl: "https://server.novaremote.test",
    token: "token",
    defaultCwd: "/workspace",
    ...overrides,
  };
}

function makeConnection(server: ServerProfile, status: ServerConnection["status"]): ServerConnection {
  return {
    server,
    connected: true,
    capabilities: {
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
    },
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: ["main", "build"],
    localAiSessions: [],
    openSessions: ["main"],
    tails: {},
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: 14,
      activeStreams: 1,
      openSessions: 1,
    },
    status,
    lastError: null,
    activeStreamCount: 1,
  };
}

describe("groupServersByVmHost", () => {
  it("groups servers by vmHost and keeps standalone servers together", () => {
    const dgx = makeServer({ id: "dgx", name: "DGX", vmHost: "Rack A" });
    const lab = makeServer({ id: "lab", name: "Lab", vmHost: "Rack A" });
    const cloud = makeServer({ id: "cloud", name: "Cloud", vmHost: "  " });
    const vmB = makeServer({ id: "vm-b", name: "VM-B", vmHost: "Rack B" });

    const groups = groupServersByVmHost([dgx, cloud, lab, vmB]);
    expect(groups).toEqual([
      { key: "vmhost:rack a", label: "Rack A", servers: [dgx, lab] },
      { key: "standalone", label: "Standalone", servers: [cloud] },
      { key: "vmhost:rack b", label: "Rack B", servers: [vmB] },
    ]);
  });
});

describe("formatServerDetails", () => {
  it("renders fallback details when no pooled connection exists", () => {
    const server = makeServer({ id: "cloud", name: "Cloud", baseUrl: "" });
    expect(formatServerDetails(server, undefined)).toBe("Status: disconnected\nURL: not set\nSessions: 0");
  });

  it("renders pooled connection details when present", () => {
    const server = makeServer({ id: "dgx", name: "DGX" });
    const details = formatServerDetails(server, makeConnection(server, "connected"));
    expect(details).toBe(
      "Status: connected\nSessions: 1 open / 2 total\nStreams: 1\nLatency: 14 ms"
    );
  });
});

describe("buildServerSwitcherMenuActions", () => {
  it("builds reconnect, details, edit, and cancel actions with handlers", () => {
    const onReconnect = vi.fn();
    const onViewDetails = vi.fn();
    const onEditServer = vi.fn();

    const actions = buildServerSwitcherMenuActions({
      onReconnect,
      onViewDetails,
      onEditServer,
    });

    expect(actions.map((action) => action.text)).toEqual([
      "Reconnect",
      "View Details",
      "Edit Server",
      "Cancel",
    ]);
    expect(actions[3].style).toBe("cancel");

    actions[0].onPress?.();
    actions[1].onPress?.();
    actions[2].onPress?.();

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(onViewDetails).toHaveBeenCalledTimes(1);
    expect(onEditServer).toHaveBeenCalledTimes(1);
  });
});

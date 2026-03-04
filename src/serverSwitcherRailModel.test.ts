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
  it("builds host hierarchy with vmType buckets and standalone fallback", () => {
    const dgx = makeServer({ id: "dgx", name: "DGX", vmHost: "Rack A", vmType: "proxmox", vmName: "dgx-vm" });
    const lab = makeServer({ id: "lab", name: "Lab", vmHost: "Rack A", vmType: "qemu", vmName: "lab-vm" });
    const cloud = makeServer({ id: "cloud", name: "Cloud", vmHost: "  ", vmType: "cloud" });
    const vmB = makeServer({ id: "vm-b", name: "VM-B", vmHost: "Rack B", vmType: "docker" });
    const bare = makeServer({ id: "bare", name: "Bare", vmHost: "Rack A" });

    const groups = groupServersByVmHost([dgx, cloud, lab, vmB, bare]);
    expect(groups.map((group) => group.label)).toEqual(["Rack A", "Rack B", "Standalone"]);

    expect(groups[0]).toEqual({
      key: "vmhost:rack a",
      label: "Rack A",
      isStandalone: false,
      servers: [bare, dgx, lab],
      vmTypeGroups: [
        { key: "vmtype:proxmox", label: "Proxmox", servers: [dgx] },
        { key: "vmtype:qemu", label: "QEMU", servers: [lab] },
        { key: "vmtype:general", label: "General", servers: [bare] },
      ],
    });
    expect(groups[1]).toEqual({
      key: "vmhost:rack b",
      label: "Rack B",
      isStandalone: false,
      servers: [vmB],
      vmTypeGroups: [{ key: "vmtype:docker", label: "Docker", servers: [vmB] }],
    });
    expect(groups[2]).toEqual({
      key: "standalone",
      label: "Standalone",
      isStandalone: true,
      servers: [cloud],
      vmTypeGroups: [{ key: "vmtype:cloud", label: "Cloud", servers: [cloud] }],
    });
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

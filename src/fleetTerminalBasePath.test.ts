import { describe, expect, it, vi } from "vitest";

import { resolveFleetTerminalApiBasePath, shouldAttemptFleetShellRun } from "./fleetTerminalBasePath";
import { ServerConnection, ServerProfile } from "./types";

function makeServer(id: string): ServerProfile {
  return {
    id,
    name: id.toUpperCase(),
    baseUrl: `https://${id}.example.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(server: ServerProfile, terminalApiBasePath: "/tmux" | "/terminal"): ServerConnection {
  return {
    server,
    connected: true,
    capabilities: {
      terminal: true,
      tmux: terminalApiBasePath === "/tmux",
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
    terminalApiBasePath,
    capabilitiesLoading: false,
    allSessions: [],
    localAiSessions: [],
    openSessions: [],
    tails: {},
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: 0,
      openSessions: 0,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: 0,
  };
}

describe("resolveFleetTerminalApiBasePath", () => {
  it("uses pooled terminal base path without probing", async () => {
    const server = makeServer("dgx");
    const detector = vi.fn(async () => "/terminal" as const);
    const connections = new Map<string, ServerConnection>([[server.id, makeConnection(server, "/tmux")]]);

    const result = await resolveFleetTerminalApiBasePath({
      server,
      connections,
      detectApiBasePath: detector,
    });

    expect(result).toBe("/tmux");
    expect(detector).not.toHaveBeenCalled();
  });

  it("falls back to probe when the server has no pooled connection", async () => {
    const server = makeServer("cloud");
    const detector = vi.fn(async () => "/terminal" as const);
    const connections = new Map<string, ServerConnection>();

    const result = await resolveFleetTerminalApiBasePath({
      server,
      connections,
      detectApiBasePath: detector,
    });

    expect(result).toBe("/terminal");
    expect(detector).toHaveBeenCalledTimes(1);
    expect(detector).toHaveBeenCalledWith(server);
  });
});

describe("shouldAttemptFleetShellRun", () => {
  it("returns false when pooled capabilities explicitly disable shellRun", () => {
    const server = makeServer("dgx");
    const connections = new Map<string, ServerConnection>([[server.id, makeConnection(server, "/tmux")]]);

    expect(shouldAttemptFleetShellRun({ serverId: server.id, connections })).toBe(false);
  });

  it("returns true when no pooled connection is available", () => {
    const connections = new Map<string, ServerConnection>();

    expect(shouldAttemptFleetShellRun({ serverId: "cloud", connections })).toBe(true);
  });

  it("returns true when pooled capabilities allow shellRun", () => {
    const server = makeServer("lab");
    const connection = makeConnection(server, "/terminal");
    connection.capabilities.shellRun = true;
    const connections = new Map<string, ServerConnection>([[server.id, connection]]);

    expect(shouldAttemptFleetShellRun({ serverId: server.id, connections })).toBe(true);
  });

  it("returns true while pooled capabilities are still loading", () => {
    const server = makeServer("spark");
    const connection = makeConnection(server, "/tmux");
    connection.capabilitiesLoading = true;
    connection.capabilities.shellRun = false;
    const connections = new Map<string, ServerConnection>([[server.id, connection]]);

    expect(shouldAttemptFleetShellRun({ serverId: server.id, connections })).toBe(true);
  });
});

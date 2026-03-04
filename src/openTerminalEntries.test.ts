import { describe, expect, it } from "vitest";

import { buildOpenTerminalEntries } from "./openTerminalEntries";
import { ServerConnection, ServerProfile } from "./types";

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(server: ServerProfile, openSessions: string[]): ServerConnection {
  return {
    server,
    connected: true,
    capabilities: {
      terminal: true,
      tmux: true,
      codex: true,
      files: true,
      shellRun: true,
      macAttach: true,
      stream: true,
      sysStats: true,
      processes: true,
      collaboration: true,
      spectate: true,
    },
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: openSessions,
    localAiSessions: [],
    openSessions,
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
      openSessions: openSessions.length,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: 0,
  };
}

describe("buildOpenTerminalEntries", () => {
  it("returns focused-server entries when all-servers mode is off", () => {
    const dgx = makeServer("dgx", "DGX");
    const entries = buildOpenTerminalEntries({
      showAllServerTerminals: false,
      sortedOpenSessions: ["build", "main"],
      focusedServerId: dgx.id,
      activeServerId: dgx.id,
      activeServerName: dgx.name,
      servers: [dgx],
      connections: new Map([[dgx.id, makeConnection(dgx, ["main", "build"])]]),
      pinnedSessions: [],
    });

    expect(entries).toEqual([
      {
        key: "dgx::build",
        serverId: "dgx",
        serverName: "DGX",
        session: "build",
        connection: expect.any(Object),
        isFocusedServer: true,
      },
      {
        key: "dgx::main",
        serverId: "dgx",
        serverName: "DGX",
        session: "main",
        connection: expect.any(Object),
        isFocusedServer: true,
      },
    ]);
  });

  it("returns pooled entries for every connected server in server order", () => {
    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Lab");
    const cloud = makeServer("cloud", "Cloud");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, ["main", "build", "zeta"])],
      [lab.id, makeConnection(lab, ["beta", "alpha"])],
    ]);

    const entries = buildOpenTerminalEntries({
      showAllServerTerminals: true,
      sortedOpenSessions: ["ignored"],
      focusedServerId: dgx.id,
      activeServerId: dgx.id,
      activeServerName: dgx.name,
      servers: [dgx, lab, cloud],
      connections,
      pinnedSessions: ["zeta"],
    });

    expect(entries.map((entry) => `${entry.serverId}:${entry.session}`)).toEqual([
      "dgx:zeta",
      "dgx:build",
      "dgx:main",
      "lab:alpha",
      "lab:beta",
    ]);
    expect(entries.every((entry) => entry.serverId !== "cloud")).toBe(true);
    expect(entries[0]?.isFocusedServer).toBe(true);
    expect(entries[3]?.isFocusedServer).toBe(false);
  });
});

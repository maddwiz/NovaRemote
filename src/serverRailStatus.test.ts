import { describe, expect, it } from "vitest";

import { ServerConnection, ServerProfile } from "./types";
import { deriveServerRailStatus, hasServerCredentials } from "./serverRailStatus";

function makeServer(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "server-1",
    name: "Server One",
    baseUrl: "https://server-1.novaremote.test",
    token: "token-1",
    defaultCwd: "/workspace",
    ...overrides,
  };
}

function makeConnection(status: ServerConnection["status"]): ServerConnection {
  return {
    server: makeServer(),
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
    status,
    lastError: null,
    activeStreamCount: 0,
  };
}

describe("serverRailStatus", () => {
  it("detects whether credentials exist", () => {
    expect(hasServerCredentials(makeServer())).toBe(true);
    expect(hasServerCredentials(makeServer({ baseUrl: "" }))).toBe(false);
    expect(hasServerCredentials(makeServer({ token: "" }))).toBe(false);
  });

  it("maps server + connection state to rail status", () => {
    const server = makeServer();

    expect(deriveServerRailStatus(makeServer({ token: "" }), undefined)).toBe("inactive");
    expect(deriveServerRailStatus(server, undefined)).toBe("disconnected");
    expect(deriveServerRailStatus(server, makeConnection("connecting"))).toBe("connecting");
    expect(deriveServerRailStatus(server, makeConnection("degraded"))).toBe("connecting");
    expect(deriveServerRailStatus(server, makeConnection("connected"))).toBe("connected");
    expect(deriveServerRailStatus(server, makeConnection("error"))).toBe("disconnected");
    expect(deriveServerRailStatus(server, makeConnection("disconnected"))).toBe("disconnected");
  });
});


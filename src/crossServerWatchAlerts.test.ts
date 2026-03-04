import { describe, expect, it } from "vitest";

import { evaluateCrossServerWatchAlerts } from "./crossServerWatchAlerts";
import { ServerConnection, ServerProfile, WatchRule } from "./types";

function makeServer(id: string, name: string): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
  };
}

function makeConnection(server: ServerProfile, tails: Record<string, string>): ServerConnection {
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
    allSessions: Object.keys(tails),
    localAiSessions: [],
    openSessions: Object.keys(tails),
    tails,
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: 0,
      openSessions: Object.keys(tails).length,
    },
    status: "connected",
    lastError: null,
    activeStreamCount: 0,
  };
}

function makeRules(pattern: string, overrides: Partial<WatchRule> = {}): Record<string, WatchRule> {
  return {
    main: {
      enabled: true,
      pattern,
      lastMatch: null,
      ...overrides,
    },
  };
}

describe("evaluateCrossServerWatchAlerts", () => {
  it("does nothing for non-pro users", () => {
    const homelab = makeServer("homelab", "Homelab");
    const result = evaluateCrossServerWatchAlerts({
      isPro: false,
      focusedServerId: null,
      servers: [homelab],
      connections: new Map([[homelab.id, makeConnection(homelab, { main: "ERROR: fail\n" })]]),
      rulesByServer: { [homelab.id]: makeRules("ERROR") },
    });

    expect(result.notifications).toEqual([]);
    expect(result.changedServerIds).toEqual([]);
    expect(result.nextRulesByServer[homelab.id]?.main?.lastMatch).toBeNull();
  });

  it("ignores the currently focused server", () => {
    const homelab = makeServer("homelab", "Homelab");
    const result = evaluateCrossServerWatchAlerts({
      isPro: true,
      focusedServerId: homelab.id,
      servers: [homelab],
      connections: new Map([[homelab.id, makeConnection(homelab, { main: "ERROR: fail\n" })]]),
      rulesByServer: { [homelab.id]: makeRules("ERROR") },
    });

    expect(result.notifications).toEqual([]);
    expect(result.changedServerIds).toEqual([]);
  });

  it("emits notifications and updates rule lastMatch for unfocused servers", () => {
    const homelab = makeServer("homelab", "Homelab");
    const result = evaluateCrossServerWatchAlerts({
      isPro: true,
      focusedServerId: "dgx",
      servers: [homelab],
      connections: new Map([[homelab.id, makeConnection(homelab, { main: "ok\nERROR: build failed\n" })]]),
      rulesByServer: { [homelab.id]: makeRules("ERROR") },
    });

    expect(result.changedServerIds).toEqual([homelab.id]);
    expect(result.notifications).toEqual([
      {
        serverId: homelab.id,
        title: "[Homelab] Watch alert",
        body: "[Homelab] Watch alert on session main: ERROR: build failed",
      },
    ]);
    expect(result.nextRulesByServer[homelab.id]?.main?.lastMatch).toBe("ERROR: build failed");
  });

  it("does not re-notify when the last match is unchanged", () => {
    const homelab = makeServer("homelab", "Homelab");
    const result = evaluateCrossServerWatchAlerts({
      isPro: true,
      focusedServerId: "dgx",
      servers: [homelab],
      connections: new Map([[homelab.id, makeConnection(homelab, { main: "ERROR: build failed\n" })]]),
      rulesByServer: {
        [homelab.id]: makeRules("ERROR", { lastMatch: "ERROR: build failed" }),
      },
    });

    expect(result.notifications).toEqual([]);
    expect(result.changedServerIds).toEqual([]);
  });

  it("isolates updates to matching servers only", () => {
    const dgx = makeServer("dgx", "DGX");
    const cloud = makeServer("cloud", "Cloud");
    const rulesByServer: Record<string, Record<string, WatchRule>> = {
      [dgx.id]: makeRules("ERROR"),
      [cloud.id]: makeRules("ERROR"),
    };

    const result = evaluateCrossServerWatchAlerts({
      isPro: true,
      focusedServerId: null,
      servers: [dgx, cloud],
      connections: new Map<string, ServerConnection>([
        [dgx.id, makeConnection(dgx, { main: "ERROR: dgx failed\n" })],
        [cloud.id, makeConnection(cloud, { main: "healthy\n" })],
      ]),
      rulesByServer,
    });

    expect(result.changedServerIds).toEqual([dgx.id]);
    expect(result.nextRulesByServer[dgx.id]?.main?.lastMatch).toBe("ERROR: dgx failed");
    expect(result.nextRulesByServer[cloud.id]?.main?.lastMatch).toBeNull();
    expect(result.notifications.map((item) => item.serverId)).toEqual([dgx.id]);
  });
});

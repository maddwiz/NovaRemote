import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerConnection, ServerProfile } from "../types";
import { useUnreadServers } from "./useUnreadServers";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

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
  const sessions = Object.keys(tails);
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
    localAiSessions: [],
    status: "connected",
    allSessions: sessions,
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
      activeStreams: 0,
      openSessions: sessions.length,
    },
    lastError: null,
    activeStreamCount: 0,
  };
}

function makeConnections(
  entries: Array<{ server: ServerProfile; tails: Record<string, string> }>
): Map<string, ServerConnection> {
  return new Map(entries.map(({ server, tails }) => [server.id, makeConnection(server, tails)]));
}

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

describe("useUnreadServers", () => {
  it("marks unfocused servers unread when output grows and clears when focused", async () => {
    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Lab");

    let latestUnread = new Set<string>();
    function Harness({ connections, focusedServerId }: { connections: Map<string, ServerConnection>; focusedServerId: string | null }) {
      latestUnread = useUnreadServers({ connections, focusedServerId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx start\n" } },
            { server: lab, tails: { main: "" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.size).toBe(0);

    await act(async () => {
      renderer!.update(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx start\ndgx next\n" } },
            { server: lab, tails: { main: "lab output\n" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });
    expect(latestUnread.has("lab")).toBe(true);

    await act(async () => {
      renderer!.update(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx start\ndgx next\n" } },
            { server: lab, tails: { main: "lab output\n" } },
          ]),
          focusedServerId: "lab",
        })
      );
    });
    expect(latestUnread.has("lab")).toBe(false);
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("does not mark unread for initial unfocused baseline output", async () => {
    const dgx = makeServer("dgx", "DGX");
    const cloud = makeServer("cloud", "Cloud");

    let latestUnread = new Set<string>();
    function Harness({ connections, focusedServerId }: { connections: Map<string, ServerConnection>; focusedServerId: string | null }) {
      latestUnread = useUnreadServers({ connections, focusedServerId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx output\n" } },
            { server: cloud, tails: { main: "existing cloud output\n" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.size).toBe(0);
    await act(async () => {
      renderer!.unmount();
    });
  });

  it("marks unread when unfocused tail content changes even if it shrinks", async () => {
    const dgx = makeServer("dgx", "DGX");
    const cloud = makeServer("cloud", "Cloud");

    let latestUnread = new Set<string>();
    function Harness({ connections, focusedServerId }: { connections: Map<string, ServerConnection>; focusedServerId: string | null }) {
      latestUnread = useUnreadServers({ connections, focusedServerId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx output\n" } },
            { server: cloud, tails: { main: "cloud baseline payload that is long\n" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.size).toBe(0);

    await act(async () => {
      renderer!.update(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx output\nmore\n" } },
            { server: cloud, tails: { main: "short\n" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.has("cloud")).toBe(true);

    await act(async () => {
      renderer!.unmount();
    });
  });

  it("drops unread entry when server is removed from pool", async () => {
    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Lab");

    let latestUnread = new Set<string>();
    function Harness({ connections, focusedServerId }: { connections: Map<string, ServerConnection>; focusedServerId: string | null }) {
      latestUnread = useUnreadServers({ connections, focusedServerId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx\n" } },
            { server: lab, tails: { main: "" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    await act(async () => {
      renderer!.update(
        React.createElement(Harness, {
          connections: makeConnections([
            { server: dgx, tails: { main: "dgx\nnext\n" } },
            { server: lab, tails: { main: "lab new\n" } },
          ]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.has("lab")).toBe(true);

    await act(async () => {
      renderer!.update(
        React.createElement(Harness, {
          connections: makeConnections([{ server: dgx, tails: { main: "dgx\nnext\n" } }]),
          focusedServerId: "dgx",
        })
      );
    });

    expect(latestUnread.has("lab")).toBe(false);
    expect(latestUnread.size).toBe(0);

    await act(async () => {
      renderer!.unmount();
    });
  });
});

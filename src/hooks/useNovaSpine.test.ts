import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { NovaAgent, NovaMemoryEntry } from "../types";
import { useNovaSpine } from "./useNovaSpine";

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

function makeAgent(overrides: Partial<NovaAgent>): NovaAgent {
  return {
    serverId: "dgx",
    agentId: "agent-default",
    name: "Agent",
    status: "idle",
    currentGoal: "",
    memoryContextId: "ctx-default",
    capabilities: [],
    pendingApproval: null,
    updatedAt: "2026-03-05T00:00:00.000Z",
    lastActionAt: null,
    ...overrides,
  };
}

function makeEntry(overrides: Partial<NovaMemoryEntry>): NovaMemoryEntry {
  return {
    id: "entry-default",
    serverId: "dgx",
    memoryContextId: "ctx-default",
    agentId: null,
    kind: "note",
    summary: "note",
    createdAt: "2026-03-05T00:00:00.000Z",
    ...overrides,
  };
}

describe("useNovaSpine", () => {
  it("builds context snapshots with status and pending approval totals", async () => {
    const nowSpy = vi.spyOn(Date, "now").mockReturnValue(Date.parse("2026-03-05T12:00:00.000Z"));
    let latest: ReturnType<typeof useNovaSpine> | null = null;

    function Harness({
      serverId,
      agents,
      entries,
    }: {
      serverId: string | null;
      agents: NovaAgent[];
      entries: NovaMemoryEntry[];
    }) {
      latest = useNovaSpine({
        serverId,
        agents,
        entries,
        staleAfterMs: 1000 * 60 * 60,
      });
      return null;
    }

    const agents = [
      makeAgent({
        agentId: "agent-a",
        name: "Build Watcher",
        status: "waiting_approval",
        memoryContextId: "ctx-build",
        pendingApproval: {
          requestedAt: "2026-03-05T11:55:00.000Z",
          summary: "Pending build",
          command: "npm run build",
          session: "build",
        },
        updatedAt: "2026-03-05T11:55:00.000Z",
      }),
      makeAgent({
        agentId: "agent-b",
        name: "Deploy Bot",
        status: "idle",
        memoryContextId: "ctx-deploy",
        updatedAt: "2026-03-05T08:00:00.000Z",
      }),
    ];
    const entries = [
      makeEntry({
        id: "entry-1",
        memoryContextId: "ctx-build",
        summary: "Build approval requested",
        kind: "approval_requested",
        createdAt: "2026-03-05T11:54:00.000Z",
      }),
      makeEntry({
        id: "entry-2",
        memoryContextId: "ctx-deploy",
        summary: "Deploy completed",
        kind: "command_dispatched",
        createdAt: "2026-03-05T08:00:00.000Z",
      }),
    ];

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(Harness, {
          serverId: "dgx",
          agents,
          entries,
        })
      );
    });

    const current = () => {
      if (!latest) {
        throw new Error("Hook state unavailable");
      }
      return latest;
    };

    expect(current().contexts).toHaveLength(2);
    expect(current().totalPendingApprovals).toBe(1);
    const buildContext = current().contextById.get("ctx-build");
    const deployContext = current().contextById.get("ctx-deploy");
    expect(buildContext?.status).toBe("waiting_approval");
    expect(buildContext?.pendingApprovalCount).toBe(1);
    expect(buildContext?.lastSummary).toBe("Build approval requested");
    expect(deployContext?.status).toBe("stale");
    expect(current().findContextByAgentId("agent-a")?.memoryContextId).toBe("ctx-build");
    expect(current().findContextByAgentId("missing")).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
    nowSpy.mockRestore();
  });

  it("supports query search by agent name, summary, and context id", async () => {
    let latest: ReturnType<typeof useNovaSpine> | null = null;

    function Harness() {
      latest = useNovaSpine({
        serverId: "dgx",
        agents: [
          makeAgent({
            agentId: "agent-a",
            name: "Build Watcher",
            status: "monitoring",
            memoryContextId: "ctx-build",
            updatedAt: "2026-03-05T11:55:00.000Z",
          }),
        ],
        entries: [
          makeEntry({
            id: "entry-1",
            memoryContextId: "ctx-build",
            summary: "Watching build logs",
            createdAt: "2026-03-05T11:56:00.000Z",
          }),
        ],
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    const current = () => {
      if (!latest) {
        throw new Error("Hook state unavailable");
      }
      return latest;
    };

    expect(current().findContextsByQuery("build")).toHaveLength(1);
    expect(current().findContextsByQuery("watcher")).toHaveLength(1);
    expect(current().findContextsByQuery("ctx-build")).toHaveLength(1);
    expect(current().findContextsByQuery("deploy")).toHaveLength(0);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

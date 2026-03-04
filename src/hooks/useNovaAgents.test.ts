import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
  };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
}));

vi.mock("../constants", () => ({
  STORAGE_NOVA_AGENTS_PREFIX: "novaremote.nova_agents.v1",
  makeId: () => "id-test",
}));

import { useNovaAgents, UseNovaAgentsResult, novaAgentsTestUtils } from "./useNovaAgents";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
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

describe("useNovaAgents helpers", () => {
  it("normalizes capabilities and storage key", () => {
    expect(novaAgentsTestUtils.uniqueCapabilities(["Watch", "watch", " Shell "])).toEqual(["watch", "shell"]);
    expect(novaAgentsTestUtils.makeStorageKey("dgx")).toBe("novaremote.nova_agents.v1.dgx");
  });
});

describe("useNovaAgents", () => {
  it("loads, mutates, and persists agents for one server", async () => {
    secureStoreMock.storage.set(
      "novaremote.nova_agents.v1.dgx",
      JSON.stringify([
        {
          serverId: "dgx",
          agentId: "agent-a",
          name: "Build Watcher",
          status: "monitoring",
          currentGoal: "Watch CI",
          memoryContextId: "memory-a",
          capabilities: ["watch", "summarize"],
          pendingApproval: null,
          updatedAt: "2026-03-03T11:00:00.000Z",
          lastActionAt: null,
        },
      ])
    );

    let latest: UseNovaAgentsResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness({ serverId }: { serverId: string | null }) {
      latest = useNovaAgents({ serverId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { serverId: "dgx" }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(current().agents).toHaveLength(1);
    expect(current().agents[0]?.name).toBe("Build Watcher");

    await act(async () => {
      current().addAgent("Deploy Agent", ["deploy", "watch", "deploy"]);
    });

    expect(current().agents.map((agent) => agent.name)).toContain("Deploy Agent");
    const deployAgent = current().agents.find((agent) => agent.name === "Deploy Agent");
    expect(deployAgent?.capabilities).toEqual(["deploy", "watch"]);

    await act(async () => {
      current().requestApproval(deployAgent?.agentId || "", {
        summary: "Run deploy command",
        command: "npm run deploy",
        session: "main",
      });
    });
    const waiting = current().agents.find((agent) => agent.agentId === deployAgent?.agentId);
    expect(waiting?.status).toBe("waiting_approval");
    expect(waiting?.pendingApproval?.command).toBe("npm run deploy");

    await act(async () => {
      current().resolveApproval(deployAgent?.agentId || "", true, { nextStatus: "executing" });
    });
    const approved = current().agents.find((agent) => agent.agentId === deployAgent?.agentId);
    expect(approved?.status).toBe("executing");
    expect(approved?.pendingApproval).toBeNull();

    expect(secureStoreMock.setItemAsync).toHaveBeenCalled();
    expect(secureStoreMock.storage.get("novaremote.nova_agents.v1.dgx")).toContain("Deploy Agent");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("isolates agents between servers", async () => {
    let latest: UseNovaAgentsResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness({ serverId }: { serverId: string | null }) {
      latest = useNovaAgents({ serverId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { serverId: "dgx" }));
    });

    await act(async () => {
      current().addAgent("DGX Agent", ["watch"]);
    });

    await act(async () => {
      renderer?.update(React.createElement(Harness, { serverId: "cloud" }));
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(current().agents).toHaveLength(0);
    expect(secureStoreMock.storage.get("novaremote.nova_agents.v1.dgx")).toContain("DGX Agent");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

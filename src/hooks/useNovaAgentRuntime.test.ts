import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  let idCounter = 0;
  return {
    storage,
    makeId: () => {
      idCounter += 1;
      return `id-${idCounter}`;
    },
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
  STORAGE_NOVA_MEMORY_PREFIX: "novaremote.nova_memory.v1",
  makeId: () => secureStoreMock.makeId(),
}));

import { useNovaAgentRuntime } from "./useNovaAgentRuntime";

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

describe("useNovaAgentRuntime", () => {
  it("creates an agent and records lifecycle memory", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({ serverId: "dgx", onDispatchCommand });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    await act(async () => {
      const created = current().addRuntimeAgent("Build Watcher", ["watch", "tools"]);
      expect(created?.name).toBe("Build Watcher");
    });

    expect(current().agents).toHaveLength(1);
    expect(current().memoryEntries.some((entry) => entry.kind === "agent_created")).toBe(true);
    expect(current().spineContexts).toHaveLength(1);
    expect(current().spineContexts[0]?.status).toBe("healthy");
    expect(current().findSpineContextByAgentId(current().agents[0]?.agentId || "")?.memoryContextId).toBe(
      current().agents[0]?.memoryContextId
    );
    expect(onDispatchCommand).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("requests and approves command dispatch through runtime flow", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({ serverId: "dgx", onDispatchCommand });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    let agentId = "";
    await act(async () => {
      const created = current().addRuntimeAgent("Deploy Agent", ["deploy"]);
      agentId = created?.agentId || "";
    });

    await act(async () => {
      const requested = current().requestAgentApproval(agentId, {
        command: "npm run deploy",
        session: "main",
      });
      expect(requested).toBe(true);
    });
    expect(current().agents[0]?.status).toBe("waiting_approval");
    expect(current().pendingSpineApprovals).toBe(1);
    expect(current().spineContexts[0]?.status).toBe("waiting_approval");

    await act(async () => {
      const approved = current().approveAgentApproval(agentId);
      expect(approved).toBe(true);
    });

    const updated = current().agents.find((agent) => agent.agentId === agentId);
    expect(updated?.status).toBe("executing");
    expect(updated?.pendingApproval).toBeNull();
    expect(onDispatchCommand).toHaveBeenCalledWith("main", "npm run deploy");
    expect(current().memoryEntries.some((entry) => entry.kind === "approval_approved")).toBe(true);
    expect(current().memoryEntries.some((entry) => entry.kind === "command_dispatched")).toBe(true);
    expect(current().pendingSpineApprovals).toBe(0);
    expect(current().spineContexts[0]?.status).toBe("active");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("denies approvals and removes agents with memory trace", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({ serverId: "dgx", onDispatchCommand });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    let agentId = "";
    await act(async () => {
      const created = current().addRuntimeAgent("QA Agent", ["qa"]);
      agentId = created?.agentId || "";
    });

    await act(async () => {
      current().requestAgentApproval(agentId, {
        command: "npm run smoke",
        session: "qa",
      });
    });

    await act(async () => {
      const denied = current().denyAgentApproval(agentId);
      expect(denied).toBe(true);
    });
    expect(current().agents.find((agent) => agent.agentId === agentId)?.status).toBe("idle");
    expect(onDispatchCommand).toHaveBeenCalledTimes(0);

    await act(async () => {
      current().removeRuntimeAgent(agentId);
    });
    expect(current().agents).toHaveLength(0);
    expect(current().memoryEntries.some((entry) => entry.kind === "agent_removed")).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("auto-queues monitoring goals when a default session is available", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({
        serverId: "dgx",
        onDispatchCommand,
        resolveDefaultSession: () => "main",
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    let agentId = "";
    await act(async () => {
      const created = current().addRuntimeAgent("Monitor Agent", ["watch"]);
      agentId = created?.agentId || "";
    });
    await act(async () => {
      current().setRuntimeAgentGoal(agentId, "npm run healthcheck");
    });

    await act(async () => {
      current().setRuntimeAgentStatus(agentId, "monitoring");
    });

    const updated = current().agents.find((agent) => agent.agentId === agentId);
    expect(updated?.status).toBe("waiting_approval");
    expect(updated?.pendingApproval?.command).toBe("npm run healthcheck");
    expect(updated?.pendingApproval?.session).toBe("main");
    expect(current().memoryEntries.some((entry) => entry.summary.includes("auto-queued monitoring goal"))).toBe(true);
    expect(onDispatchCommand).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("keeps monitoring status when no default session is available", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({
        serverId: "dgx",
        onDispatchCommand,
        resolveDefaultSession: () => null,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    let agentId = "";
    await act(async () => {
      const created = current().addRuntimeAgent("Monitor Agent", ["watch"]);
      agentId = created?.agentId || "";
    });
    await act(async () => {
      current().setRuntimeAgentGoal(agentId, "npm run healthcheck");
    });

    await act(async () => {
      current().setRuntimeAgentStatus(agentId, "monitoring");
    });

    const updated = current().agents.find((agent) => agent.agentId === agentId);
    expect(updated?.status).toBe("monitoring");
    expect(updated?.pendingApproval).toBeNull();
    expect(onDispatchCommand).toHaveBeenCalledTimes(0);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("supports bulk approve-ready and deny-all pending approval flows", async () => {
    const onDispatchCommand = vi.fn();
    let latest: ReturnType<typeof useNovaAgentRuntime> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAgentRuntime({ serverId: "dgx", onDispatchCommand });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    let agentAId = "";
    let agentBId = "";
    await act(async () => {
      const agentA = current().addRuntimeAgent("Agent A", ["watch"]);
      const agentB = current().addRuntimeAgent("Agent B", ["deploy"]);
      agentAId = agentA?.agentId || "";
      agentBId = agentB?.agentId || "";
    });

    await act(async () => {
      current().requestAgentApproval(agentAId, {
        command: "npm run lint",
        session: "lint",
      });
      current().requestAgentApproval(agentBId, {
        command: "npm run deploy",
        session: "deploy",
      });
    });

    let approvedIds: string[] = [];
    await act(async () => {
      approvedIds = current().approveReadyApprovals();
    });

    expect(approvedIds.sort()).toEqual([agentAId, agentBId].sort());
    expect(onDispatchCommand).toHaveBeenCalledWith("lint", "npm run lint");
    expect(onDispatchCommand).toHaveBeenCalledWith("deploy", "npm run deploy");
    expect(current().agents.find((agent) => agent.agentId === agentAId)?.status).toBe("executing");
    expect(current().agents.find((agent) => agent.agentId === agentBId)?.status).toBe("executing");

    await act(async () => {
      current().requestAgentApproval(agentAId, {
        command: "npm run smoke",
        session: "smoke",
      });
      current().requestAgentApproval(agentBId, {
        command: "npm run verify",
        session: "verify",
      });
    });

    let deniedIds: string[] = [];
    await act(async () => {
      deniedIds = current().denyAllPendingApprovals();
    });

    expect(deniedIds.sort()).toEqual([agentAId, agentBId].sort());
    expect(current().agents.find((agent) => agent.agentId === agentAId)?.status).toBe("idle");
    expect(current().agents.find((agent) => agent.agentId === agentBId)?.status).toBe("idle");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

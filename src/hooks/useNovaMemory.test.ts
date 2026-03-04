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
  STORAGE_NOVA_MEMORY_PREFIX: "novaremote.nova_memory.v1",
  makeId: () => "id-test",
}));

import { UseNovaMemoryResult, useNovaMemory, novaMemoryTestUtils } from "./useNovaMemory";

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

describe("useNovaMemory helpers", () => {
  it("builds storage key and normalizes entries", () => {
    expect(novaMemoryTestUtils.makeStorageKey("dgx")).toBe("novaremote.nova_memory.v1.dgx");
    const normalized = novaMemoryTestUtils.normalizeMemoryEntry(
      {
        id: "entry-1",
        memoryContextId: "ctx-1",
        summary: "hello",
        kind: "approval_requested",
        createdAt: "2026-03-03T10:00:00.000Z",
      },
      "dgx"
    );

    expect(normalized?.serverId).toBe("dgx");
    expect(normalized?.kind).toBe("approval_requested");
  });
});

describe("useNovaMemory", () => {
  it("adds and persists memory entries", async () => {
    let latest: UseNovaMemoryResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness({ serverId }: { serverId: string | null }) {
      latest = useNovaMemory({ serverId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { serverId: "dgx" }));
    });

    await act(async () => {
      current().addEntry({
        memoryContextId: "mem-a",
        agentId: "agent-a",
        kind: "agent_created",
        summary: "Agent created",
      });
      current().addEntry({
        memoryContextId: "mem-a",
        agentId: "agent-a",
        kind: "command_dispatched",
        summary: "Dispatched command",
        command: "npm run build",
        session: "main",
      });
    });

    expect(current().entries).toHaveLength(2);
    expect(current().entries[0]?.kind).toBe("command_dispatched");
    expect(secureStoreMock.setItemAsync).toHaveBeenCalled();
    expect(secureStoreMock.storage.get("novaremote.nova_memory.v1.dgx")).toContain("Dispatched command");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("clears entries by context", async () => {
    let latest: UseNovaMemoryResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness({ serverId }: { serverId: string | null }) {
      latest = useNovaMemory({ serverId });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { serverId: "dgx" }));
    });

    await act(async () => {
      current().addEntry({
        memoryContextId: "mem-a",
        kind: "note",
        summary: "A",
      });
      current().addEntry({
        memoryContextId: "mem-b",
        kind: "note",
        summary: "B",
      });
    });

    expect(current().entries).toHaveLength(2);

    await act(async () => {
      current().clearContext("mem-a");
    });

    expect(current().entries).toHaveLength(1);
    expect(current().entries[0]?.memoryContextId).toBe("mem-b");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

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
  STORAGE_SHARED_WORKSPACES: "novaremote.shared_workspaces.v1",
  makeId: () => "id-test",
}));

import { UseSharedWorkspacesResult, sharedWorkspacesTestUtils, useSharedWorkspaces } from "./useSharedWorkspaces";

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

describe("shared workspace helpers", () => {
  it("normalizes ids and members", () => {
    expect(sharedWorkspacesTestUtils.uniqueIds(["a", "a", "b", " "])).toEqual(["a", "b"]);
    expect(sharedWorkspacesTestUtils.normalizeMembers(undefined)).toEqual([
      { id: "local-user", name: "Local User", role: "owner" },
    ]);
  });
});

describe("useSharedWorkspaces", () => {
  it("creates workspace and persists changes", async () => {
    let latest: UseSharedWorkspacesResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useSharedWorkspaces();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().createWorkspace({
        name: "Ops Team",
        serverIds: ["dgx", "cloud", "dgx"],
      });
    });

    expect(current().workspaces).toHaveLength(1);
    expect(current().workspaces[0]?.serverIds).toEqual(["dgx", "cloud"]);
    expect(secureStoreMock.setItemAsync).toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates servers and roles", async () => {
    let latest: UseSharedWorkspacesResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useSharedWorkspaces();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().createWorkspace({
        name: "Dev Team",
        serverIds: ["dgx"],
        members: [
          { id: "user-a", name: "Alice", role: "owner" },
          { id: "user-b", name: "Bob", role: "viewer" },
        ],
      });
    });

    const workspaceId = current().workspaces[0]?.id || "";

    await act(async () => {
      current().setWorkspaceServers(workspaceId, ["dgx", "home"]);
      current().setMemberRole(workspaceId, "user-b", "editor");
    });

    const workspace = current().workspaces[0];
    expect(workspace?.serverIds).toEqual(["dgx", "home"]);
    expect(workspace?.members.find((member) => member.id === "user-b")?.role).toBe("editor");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

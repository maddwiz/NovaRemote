import * as SecureStore from "expo-secure-store";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../../constants", () => ({
  STORAGE_VR_WORKSPACE_PREFIX: "novaremote.vr_workspace.v1",
}));

import {
  makeVrWorkspaceScope,
  makeVrWorkspaceStorageKey,
  normalizeVrWorkspaceSnapshot,
  useVrWorkspacePrefs,
} from "../useVrWorkspacePrefs";
import { VrWorkspaceSnapshot } from "../contracts";

const getItemAsyncMock = vi.mocked(SecureStore.getItemAsync);
const setItemAsyncMock = vi.mocked(SecureStore.setItemAsync);
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (
      joined.includes("react-test-renderer is deprecated") ||
      joined.includes("The current testing environment is not configured to support act")
    ) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  getItemAsyncMock.mockReset();
  setItemAsyncMock.mockReset();
  getItemAsyncMock.mockResolvedValue(null);
  setItemAsyncMock.mockResolvedValue(undefined);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("useVrWorkspacePrefs helpers", () => {
  it("builds stable scope hashes regardless of server ordering", () => {
    const a = makeVrWorkspaceScope(["dgx", "homelab", "cloud"]);
    const b = makeVrWorkspaceScope(["cloud", "dgx", "homelab"]);

    expect(a).toBe(b);
  });

  it("builds a storage key with the VR workspace prefix", () => {
    const key = makeVrWorkspaceStorageKey(["dgx", "cloud"]);
    expect(key.startsWith("novaremote.vr_workspace.v1.")).toBe(true);
  });

  it("normalizes snapshot panel order, focus, pins, and custom transforms", () => {
    const normalized = normalizeVrWorkspaceSnapshot(
      {
        version: "0.0.1",
        preset: "custom",
        focusedPanelId: "missing",
        panelIds: ["a", "b", "x", "a", "c"],
        pinnedPanelIds: ["x", "b", "b"],
        customTransforms: {
          a: { x: 0.2, y: 1.1, z: -1.4, yaw: 11, width: 1.2, bad: true },
          x: { x: 999, y: 999, z: 999, yaw: 999 },
          c: { x: 0.4, y: 1.3, z: -1.1 },
        },
      },
      ["a", "b", "c"],
      2
    );

    expect(normalized.version).toBe("1.0.0");
    expect(normalized.preset).toBe("custom");
    expect(normalized.panelIds).toEqual(["a", "b"]);
    expect(normalized.pinnedPanelIds).toEqual(["b"]);
    expect(normalized.focusedPanelId).toBe("a");
    expect(normalized.customTransforms).toEqual({
      a: { x: 0.2, y: 1.1, z: -1.4, yaw: 11, width: 1.2 },
    });
  });

  it("falls back to first allowed panel and default preset", () => {
    const normalized = normalizeVrWorkspaceSnapshot({}, ["main"], 4);

    expect(normalized.preset).toBe("arc");
    expect(normalized.panelIds).toEqual(["main"]);
    expect(normalized.focusedPanelId).toBe("main");
    expect(normalized.customTransforms).toBeUndefined();
  });
});

describe("useVrWorkspacePrefs", () => {
  it("does not overwrite hydrated snapshots with stale pre-restore state", async () => {
    getItemAsyncMock.mockResolvedValueOnce(
      JSON.stringify({
        version: "1.0.0",
        preset: "custom",
        focusedPanelId: "b",
        panelIds: ["b"],
        pinnedPanelIds: ["b"],
        customTransforms: {
          b: { x: 0.4, y: 1.8, z: -1.5, yaw: 16 },
        },
      })
    );

    function Harness() {
      const [snapshot, setSnapshot] = React.useState<VrWorkspaceSnapshot>({
        version: "1.0.0" as const,
        preset: "arc",
        focusedPanelId: "a" as string | null,
        panelIds: ["a"],
        pinnedPanelIds: [] as string[],
      });
      useVrWorkspacePrefs({
        serverScopeIds: ["dgx"],
        panelUniverseIds: ["a", "b"],
        maxPanels: 6,
        value: snapshot,
        onRestore: setSnapshot,
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
    await act(async () => {
      await Promise.resolve();
    });

    expect(getItemAsyncMock).toHaveBeenCalledTimes(1);
    const payloads = setItemAsyncMock.mock.calls.map((call) => JSON.parse(String(call[1])) as { panelIds: string[] });
    const staleWrite = payloads.some((payload) => payload.panelIds[0] === "a");
    expect(staleWrite).toBe(false);
    if (payloads.length > 0) {
      expect(payloads[payloads.length - 1]?.panelIds).toEqual(["b"]);
    }

    await act(async () => {
      renderer?.unmount();
    });
  });
});

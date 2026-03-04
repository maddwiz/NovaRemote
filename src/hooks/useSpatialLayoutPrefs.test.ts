import * as SecureStore from "expo-secure-store";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../constants", () => ({
  STORAGE_SPATIAL_LAYOUT_PREFIX: "novaremote.spatial_layout.v1",
}));

import {
  makeSpatialLayoutScope,
  makeSpatialLayoutStorageKey,
  normalizeSpatialLayoutSnapshot,
  useSpatialLayoutPrefs,
} from "./useSpatialLayoutPrefs";

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

describe("useSpatialLayoutPrefs helpers", () => {
  it("builds stable scope hashes regardless of order", () => {
    const a = makeSpatialLayoutScope(["dgx", "homelab", "cloud"]);
    const b = makeSpatialLayoutScope(["cloud", "dgx", "homelab"]);

    expect(a).toBe(b);
  });

  it("builds a storage key with brand + scope", () => {
    const key = makeSpatialLayoutStorageKey("meta_orion", ["dgx", "cloud"]);

    expect(key.startsWith("novaremote.spatial_layout.v1.meta_orion.")).toBe(true);
  });

  it("normalizes snapshots to allowed panels and limits", () => {
    const normalized = normalizeSpatialLayoutSnapshot(
      {
        panelIds: ["a", "b", "x", "a", "c"],
        pinnedPanelIds: ["x", "b", "b"],
        focusedPanelId: "x",
        overviewMode: false,
      },
      ["a", "b", "c"],
      2
    );

    expect(normalized.panelIds).toEqual(["a", "b"]);
    expect(normalized.pinnedPanelIds).toEqual(["b"]);
    expect(normalized.focusedPanelId).toBe("a");
    expect(normalized.overviewMode).toBe(false);
  });

  it("falls back to first allowed panel", () => {
    const normalized = normalizeSpatialLayoutSnapshot({}, ["main"], 4);

    expect(normalized.panelIds).toEqual(["main"]);
    expect(normalized.focusedPanelId).toBe("main");
    expect(normalized.overviewMode).toBe(true);
  });
});

describe("useSpatialLayoutPrefs", () => {
  it("does not overwrite stored snapshot with stale pre-restore state", async () => {
    getItemAsyncMock.mockResolvedValueOnce(
      JSON.stringify({
        panelIds: ["b"],
        pinnedPanelIds: ["b"],
        focusedPanelId: "b",
        overviewMode: false,
      })
    );

    function Harness() {
      const [snapshot, setSnapshot] = React.useState({
        panelIds: ["a"],
        pinnedPanelIds: [] as string[],
        focusedPanelId: "a" as string | null,
        overviewMode: true,
      });
      useSpatialLayoutPrefs({
        brand: "meta_orion",
        serverScopeIds: ["dgx"],
        panelUniverseIds: ["a", "b"],
        maxPanels: 4,
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

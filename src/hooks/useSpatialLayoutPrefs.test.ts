import { describe, expect, it, vi } from "vitest";

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
} from "./useSpatialLayoutPrefs";

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

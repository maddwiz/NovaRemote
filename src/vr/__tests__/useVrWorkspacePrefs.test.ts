import { describe, expect, it, vi } from "vitest";

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
} from "../useVrWorkspacePrefs";

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

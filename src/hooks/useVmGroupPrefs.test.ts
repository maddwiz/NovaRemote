import * as SecureStore from "expo-secure-store";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

import {
  makeVmGroupPrefsStorageKey,
  normalizeVmGroupPrefsSnapshot,
  useVmGroupPrefs,
} from "./useVmGroupPrefs";

type VmGroupPrefsState = {
  collapsedGroupKeys: string[];
  toggleGroupCollapsed: (groupKey: string) => void;
};

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

describe("useVmGroupPrefs helpers", () => {
  it("builds storage keys from scope", () => {
    expect(makeVmGroupPrefsStorageKey("rail")).toBe("novaremote.vm_group_prefs.v1.rail");
    expect(makeVmGroupPrefsStorageKey("servers")).toBe("novaremote.vm_group_prefs.v1.servers");
  });

  it("normalizes collapsed groups against available keys", () => {
    const normalized = normalizeVmGroupPrefsSnapshot(
      {
        collapsedGroupKeys: ["rack-a", "rack-a", "missing", "rack-b"],
      },
      ["rack-b", "rack-a"]
    );

    expect(normalized.collapsedGroupKeys).toEqual(["rack-a", "rack-b"]);
  });
});

describe("useVmGroupPrefs", () => {
  it("restores persisted collapsed groups and persists updates", async () => {
    getItemAsyncMock.mockResolvedValueOnce(
      JSON.stringify({
        collapsedGroupKeys: ["rack-a", "missing"],
      })
    );

    let latest: VmGroupPrefsState | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVmGroupPrefs({
        scope: "rail",
        groupKeys: ["rack-a", "rack-b"],
      }) as VmGroupPrefsState;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().collapsedGroupKeys).toEqual(["rack-a"]);

    await act(async () => {
      current().toggleGroupCollapsed("rack-b");
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(current().collapsedGroupKeys).toEqual(["rack-a", "rack-b"]);
    const payloads = setItemAsyncMock.mock.calls.map((call) => JSON.parse(String(call[1])) as { collapsedGroupKeys?: string[] });
    expect(payloads.some((payload) => payload.collapsedGroupKeys?.includes("rack-b"))).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("prunes collapsed groups when vm hosts disappear", async () => {
    getItemAsyncMock.mockResolvedValueOnce(
      JSON.stringify({
        collapsedGroupKeys: ["rack-a"],
      })
    );

    let latest: VmGroupPrefsState | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness({ groupKeys }: { groupKeys: string[] }) {
      latest = useVmGroupPrefs({
        scope: "servers",
        groupKeys,
      }) as VmGroupPrefsState;
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness, { groupKeys: ["rack-a", "rack-b"] }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(current().collapsedGroupKeys).toEqual(["rack-a"]);

    await act(async () => {
      renderer?.update(React.createElement(Harness, { groupKeys: ["rack-b"] }));
    });

    expect(current().collapsedGroupKeys).toEqual([]);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

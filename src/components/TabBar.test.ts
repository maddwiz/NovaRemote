import React from "react";
import * as ReactNative from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TabBar } from "./TabBar";

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

describe("TabBar", () => {
  it("routes VR tab presses through onChange on wide layout", async () => {
    const onChange = vi.fn();
    vi.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 900,
      height: 900,
      scale: 2,
      fontScale: 1,
    });
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(TabBar, {
          route: "terminals",
          onChange,
        })
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Open VR command center tab" }).props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith("vr");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("opens the drawer and routes tab presses on compact layout", async () => {
    const onChange = vi.fn();
    vi.spyOn(ReactNative, "useWindowDimensions").mockReturnValue({
      width: 390,
      height: 844,
      scale: 3,
      fontScale: 1,
    });
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(TabBar, {
          route: "terminals",
          onChange,
        })
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Open navigation menu" }).props.onPress();
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Open VR command center tab" }).props.onPress();
    });

    expect(onChange).toHaveBeenCalledWith("vr");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

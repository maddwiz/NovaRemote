import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SpatialPanel, SpatialTerminalLayout } from "./SpatialTerminalLayout";

function makePanel(overrides: Partial<SpatialPanel>): SpatialPanel {
  return {
    id: "dgx::main",
    serverId: "dgx",
    serverName: "DGX",
    session: "main",
    sessionLabel: "main",
    position: "center",
    pinned: false,
    focused: true,
    output: "line-1\nline-2\n",
    ...overrides,
  };
}

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

describe("SpatialTerminalLayout", () => {
  async function renderLayout(
    props: React.ComponentProps<typeof SpatialTerminalLayout>
  ): Promise<TestRenderer.ReactTestRenderer> {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(SpatialTerminalLayout, props));
    });
    return renderer!;
  }

  it("calls focus, pin, and remove callbacks for panel actions", async () => {
    const onFocusPanel = vi.fn();
    const onTogglePinPanel = vi.fn();
    const onRemovePanel = vi.fn();
    const onCyclePanel = vi.fn();
    const panel = makePanel({});

    const renderer = await renderLayout({
      panels: [panel],
      onFocusPanel,
      onTogglePinPanel,
      onRemovePanel,
      onCyclePanel,
    });

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: `Focus ${panel.serverName} ${panel.sessionLabel}` })
        .props.onPress();
    });
    expect(onFocusPanel).toHaveBeenCalledWith(panel.id);

    act(() => {
      renderer.root
        .findByProps({ accessibilityLabel: `Focus ${panel.serverName} ${panel.sessionLabel}` })
        .props.onLongPress();
    });
    expect(onTogglePinPanel).toHaveBeenCalledWith(panel.id);

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: `Remove panel ${panel.sessionLabel}` }).props.onPress();
    });
    expect(onRemovePanel).toHaveBeenCalledWith(panel.id);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("routes horizontal swipe gestures to cycle callbacks", async () => {
    const onFocusPanel = vi.fn();
    const onTogglePinPanel = vi.fn();
    const onRemovePanel = vi.fn();
    const onCyclePanel = vi.fn();

    const renderer = await renderLayout({
      panels: [makePanel({ id: "dgx::main" })],
      onFocusPanel,
      onTogglePinPanel,
      onRemovePanel,
      onCyclePanel,
    });

    const root = renderer.root
      .findAll((node) => String(node.type) === "View")
      .find((node) => typeof node.props.onPanResponderRelease === "function");
    expect(root).toBeDefined();

    act(() => {
      root?.props.onPanResponderRelease?.({}, { dx: -60, dy: 4 });
    });
    expect(onCyclePanel).toHaveBeenLastCalledWith("next");

    act(() => {
      root?.props.onPanResponderRelease?.({}, { dx: 70, dy: 2 });
    });
    expect(onCyclePanel).toHaveBeenLastCalledWith("prev");

    const callsAfterValidSwipes = onCyclePanel.mock.calls.length;
    act(() => {
      root?.props.onPanResponderRelease?.({}, { dx: 12, dy: 1 });
      root?.props.onPanResponderRelease?.({}, { dx: 40, dy: 60 });
    });
    expect(onCyclePanel.mock.calls.length).toBe(callsAfterValidSwipes);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("renders empty panel placeholders for missing positions", async () => {
    const renderer = await renderLayout({
      panels: [makePanel({ position: "center" })],
      onFocusPanel: () => {},
      onTogglePinPanel: () => {},
      onRemovePanel: () => {},
      onCyclePanel: () => {},
    });

    const pressables = renderer.root.findAll((node) => String(node.type) === "Pressable");
    expect(pressables.length).toBeGreaterThan(0);

    await act(async () => {
      renderer.unmount();
    });
  });
});

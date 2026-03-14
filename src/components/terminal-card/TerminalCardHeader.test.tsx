import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TerminalCardHeader } from "./TerminalCardHeader";

vi.mock("expo-haptics", () => ({
  selectionAsync: vi.fn(async () => undefined),
  impactAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: {
    Light: "Light",
    Medium: "Medium",
  },
}));

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

const noop = () => {};

function buildProps(overrides: Partial<React.ComponentProps<typeof TerminalCardHeader>> = {}): React.ComponentProps<typeof TerminalCardHeader> {
  return {
    session: "main",
    sessionAlias: "Main",
    mode: "shell",
    aiAvailable: true,
    shellAvailable: true,
    aiEngine: "auto",
    canUseServerAi: true,
    canUseExternalAi: true,
    collaborationAvailable: false,
    activeCollaboratorCount: 0,
    streamState: "live",
    liveLabel: "LIVE",
    canOpenOnMac: true,
    canSync: true,
    canShareLive: true,
    canStop: true,
    pinned: false,
    recordingActive: false,
    recordingChunks: 0,
    readOnly: false,
    onSetMode: noop,
    onSetAiEngine: noop,
    onOpenOnMac: noop,
    onSync: noop,
    onShareLive: noop,
    onExport: noop,
    onFullscreen: noop,
    onTogglePin: noop,
    onToggleRecording: noop,
    onOpenPlayback: noop,
    onStop: noop,
    onAutoName: noop,
    onHide: noop,
    ...overrides,
  };
}

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

describe("TerminalCardHeader", () => {
  it("renders server label badge when requested", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <TerminalCardHeader {...buildProps({ serverLabel: "Homelab", showServerLabel: true })} />
      );
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }
    const root = (renderer as unknown as TestRenderer.ReactTestRenderer).root;
    expect(() => root.findByProps({ children: "Homelab" })).not.toThrow();

    await act(async () => {
      renderer?.update(<TerminalCardHeader {...buildProps({ serverLabel: "Homelab", showServerLabel: false })} />);
    });
    expect(() => root.findByProps({ children: "Homelab" })).toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("disables stop action for read-only sessions", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(<TerminalCardHeader {...buildProps({ readOnly: true, canStop: true })} />);
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }
    const root = (renderer as unknown as TestRenderer.ReactTestRenderer).root;
    const stopButton = root.findByProps({ accessibilityLabel: "Close main" });
    expect(stopButton.props.disabled).toBe(true);

    await act(async () => {
      renderer?.update(<TerminalCardHeader {...buildProps({ readOnly: false, canStop: true })} />);
    });
    const enabledStop = root.findByProps({ accessibilityLabel: "Close main" });
    expect(enabledStop.props.disabled).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

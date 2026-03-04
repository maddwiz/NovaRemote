import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { VrGestureEvent } from "../inputGestures";
import { useVrInputRouter, UseVrInputRouterResult } from "../useVrInputRouter";
import { VrWorkspaceGestureAction, VrWorkspaceVoiceAction } from "../useVrWorkspace";

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
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("useVrInputRouter", () => {
  it("dispatches voice send actions and reports success in HUD state", async () => {
    const applyVoiceTranscript = vi.fn<(transcript: string) => VrWorkspaceVoiceAction>(() => ({
      kind: "send",
      panelId: "dgx::main",
      serverId: "dgx",
      session: "main",
      command: "npm test",
    }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "none" }));
    const onSendCommand = vi.fn(async () => undefined);

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("send to dgx: npm test");
    });

    expect(applyVoiceTranscript).toHaveBeenCalledWith("send to dgx: npm test");
    expect(onSendCommand).toHaveBeenCalledWith("dgx", "main", "npm test");
    expect(current().hudStatus?.severity).toBe("success");
    expect(current().hudStatus?.message).toContain("Sent to dgx/main");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("toggles overview mode from voice and gesture actions", async () => {
    const applyVoiceTranscript = vi.fn<(transcript: string) => VrWorkspaceVoiceAction>(() => ({ kind: "overview" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({ kind: "overview" }));
    const onSetOverviewMode = vi.fn();

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
        onSetOverviewMode,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      await current().dispatchVoice("show all panels");
    });
    expect(onSetOverviewMode).toHaveBeenCalledWith(true);

    await act(async () => {
      current().dispatchGesture({ kind: "spread_overview" });
    });
    expect(onSetOverviewMode).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("records rotate HUD status for gesture rotation actions", async () => {
    const applyVoiceTranscript = vi.fn<(transcript: string) => VrWorkspaceVoiceAction>(() => ({ kind: "none" }));
    const applyGesture = vi.fn<(event: VrGestureEvent) => VrWorkspaceGestureAction>(() => ({
      kind: "rotate_workspace",
      direction: "left",
    }));

    let latest: UseVrInputRouterResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Router not ready");
      }
      return latest;
    };
    function Harness() {
      latest = useVrInputRouter({
        workspace: { applyVoiceTranscript, applyGesture },
        onSendCommand: async () => undefined,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().dispatchGesture({ kind: "fist_pull_rotate", direction: "left" });
    });

    expect(current().hudStatus?.message).toContain("Rotated workspace left");
    expect(current().hudStatus?.severity).toBe("info");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

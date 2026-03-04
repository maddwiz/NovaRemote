import { describe, expect, it } from "vitest";

import { VrPanelState } from "../contracts";
import { inputGesturesTestUtils, resolveVrGestureAction } from "../inputGestures";

function makePanel(id: string, width = 1.0, height = 0.6): VrPanelState {
  return {
    id,
    serverId: "server-1",
    serverName: "Server",
    session: "main",
    sessionLabel: "main",
    transform: {
      x: 0,
      y: 1.4,
      z: -1.8,
      yaw: 0,
      width,
      height,
    },
  };
}

describe("resolveVrGestureAction", () => {
  it("focuses the targeted panel for point/trigger gestures", () => {
    const panels = [makePanel("a"), makePanel("b")];
    const action = resolveVrGestureAction({
      event: { kind: "point_trigger", panelId: "b" },
      panels,
      focusedPanelId: "a",
    });

    expect(action).toEqual({ kind: "focus", panelId: "b" });
  });

  it("builds movement patches for grab gestures", () => {
    const panels = [makePanel("a")];
    const action = resolveVrGestureAction({
      event: { kind: "grab_move", panelId: "a", deltaX: 0.2, deltaY: -0.1, deltaYaw: 7 },
      panels,
      focusedPanelId: "a",
    });

    expect(action).toEqual({
      kind: "move",
      panelId: "a",
      patch: { x: 0.2, y: -0.1, z: 0, yaw: 7 },
    });
  });

  it("builds bounded resize patches for pinch gestures", () => {
    const panels = [makePanel("a", 1.4, 0.7)];
    const action = resolveVrGestureAction({
      event: { kind: "pinch_resize", panelId: "a", scale: 3 },
      panels,
      focusedPanelId: "a",
    });

    expect(action).toEqual({
      kind: "resize",
      panelId: "a",
      patch: {
        width: 2.5,
        height: 1.6,
      },
    });
  });

  it("maps fist-pull delta direction to workspace rotation", () => {
    const panels = [makePanel("a"), makePanel("b")];
    const action = resolveVrGestureAction({
      event: { kind: "fist_pull_rotate", deltaX: -0.3 },
      panels,
      focusedPanelId: "a",
    });

    expect(action).toEqual({
      kind: "rotate_workspace",
      direction: "left",
    });
  });

  it("maps spread gestures to overview action", () => {
    const action = resolveVrGestureAction({
      event: { kind: "spread_overview" },
      panels: [makePanel("a")],
      focusedPanelId: "a",
    });

    expect(action).toEqual({ kind: "overview" });
  });

  it("maps snap layout gestures to preset actions", () => {
    const action = resolveVrGestureAction({
      event: { kind: "snap_layout", preset: "grid" },
      panels: [makePanel("a")],
      focusedPanelId: "a",
    });

    expect(action).toEqual({ kind: "snap_layout", preset: "grid" });
  });

  it("maps approval gestures to agent lifecycle actions", () => {
    const panels = [makePanel("a")];
    const approveFocused = resolveVrGestureAction({
      event: { kind: "approve_agents" },
      panels,
      focusedPanelId: "a",
    });
    const denyAll = resolveVrGestureAction({
      event: { kind: "deny_agents", scope: "all" },
      panels,
      focusedPanelId: "a",
    });

    expect(approveFocused).toEqual({ kind: "gesture_approve_ready_agents", scope: "focused" });
    expect(denyAll).toEqual({ kind: "gesture_deny_all_pending_agents", scope: "all" });
  });
});

describe("inputGesturesTestUtils", () => {
  it("resolves panel fallback to focused panel id", () => {
    const resolved = inputGesturesTestUtils.resolvePanelId(undefined, [makePanel("a"), makePanel("b")], "b");
    expect(resolved).toBe("b");
  });
});

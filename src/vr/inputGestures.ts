import { VrPanelState, VrPanelTransform } from "./contracts";

export type VrGestureDirection = "left" | "right";

export type VrGestureEvent =
  | { kind: "point_trigger"; panelId?: string }
  | {
      kind: "grab_move";
      panelId?: string;
      deltaX?: number;
      deltaY?: number;
      deltaZ?: number;
      deltaYaw?: number;
    }
  | { kind: "pinch_resize"; panelId?: string; scale?: number }
  | { kind: "spread_overview" }
  | { kind: "fist_pull_rotate"; direction?: VrGestureDirection; deltaX?: number };

export type VrGestureAction =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "move"; panelId: string; patch: Partial<VrPanelTransform> }
  | { kind: "resize"; panelId: string; patch: Partial<VrPanelTransform> }
  | { kind: "overview" }
  | { kind: "rotate_workspace"; direction: VrGestureDirection };

const MIN_WIDTH = 0.6;
const MAX_WIDTH = 2.5;
const MIN_HEIGHT = 0.35;
const MAX_HEIGHT = 1.6;

function asFinite(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function resolvePanelId(panelId: string | undefined, panels: VrPanelState[], focusedPanelId: string | null): string | null {
  if (panelId && panels.some((panel) => panel.id === panelId)) {
    return panelId;
  }
  if (focusedPanelId && panels.some((panel) => panel.id === focusedPanelId)) {
    return focusedPanelId;
  }
  return panels[0]?.id || null;
}

function resolvePanel(panelId: string, panels: VrPanelState[]): VrPanelState | null {
  return panels.find((panel) => panel.id === panelId) || null;
}

export type ResolveVrGestureActionArgs = {
  event: VrGestureEvent;
  panels: VrPanelState[];
  focusedPanelId: string | null;
};

export function resolveVrGestureAction({
  event,
  panels,
  focusedPanelId,
}: ResolveVrGestureActionArgs): VrGestureAction {
  if (event.kind === "spread_overview") {
    return { kind: "overview" };
  }

  if (event.kind === "fist_pull_rotate") {
    if (event.direction) {
      return { kind: "rotate_workspace", direction: event.direction };
    }
    const deltaX = asFinite(event.deltaX);
    if (Math.abs(deltaX) < 0.1) {
      return { kind: "none" };
    }
    return { kind: "rotate_workspace", direction: deltaX > 0 ? "right" : "left" };
  }

  const panelId = resolvePanelId(event.panelId, panels, focusedPanelId);
  if (!panelId) {
    return { kind: "none" };
  }

  if (event.kind === "point_trigger") {
    return { kind: "focus", panelId };
  }

  if (event.kind === "grab_move") {
    const deltaX = asFinite(event.deltaX);
    const deltaY = asFinite(event.deltaY);
    const deltaZ = asFinite(event.deltaZ);
    const deltaYaw = asFinite(event.deltaYaw);
    if (deltaX === 0 && deltaY === 0 && deltaZ === 0 && deltaYaw === 0) {
      return { kind: "none" };
    }
    return {
      kind: "move",
      panelId,
      patch: {
        x: deltaX,
        y: deltaY,
        z: deltaZ,
        yaw: deltaYaw,
      },
    };
  }

  const scale = asFinite(event.scale);
  if (scale <= 0 || scale === 1) {
    return { kind: "none" };
  }

  const panel = resolvePanel(panelId, panels);
  if (!panel) {
    return { kind: "none" };
  }
  const width = panel.transform.width ?? 1.05;
  const height = panel.transform.height ?? 0.62;

  return {
    kind: "resize",
    panelId,
    patch: {
      width: clamp(width * scale, MIN_WIDTH, MAX_WIDTH),
      height: clamp(height * scale, MIN_HEIGHT, MAX_HEIGHT),
    },
  };
}

export const inputGesturesTestUtils = {
  clamp,
  resolvePanelId,
};

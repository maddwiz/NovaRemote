import { findPanelByTarget, resolveSpatialVoiceRoute, VoiceRoutePanel } from "../spatialVoiceRoutingCore";

export type VrRoutePanel = VoiceRoutePanel;

export type VrVoiceIntent =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "send"; panelId: string; command: string }
  | { kind: "overview" }
  | { kind: "minimize" }
  | { kind: "rotate_workspace"; direction: "left" | "right" };

export function findVrPanelByTarget(panels: VrRoutePanel[], target: string): VrRoutePanel | null {
  return findPanelByTarget(panels, target);
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const route = resolveSpatialVoiceRoute({
    transcript,
    panels,
    focusedPanelId,
  });

  if (route.kind === "none") {
    return { kind: "none" };
  }
  if (route.kind === "show_all") {
    return { kind: "overview" };
  }
  if (route.kind === "minimize") {
    return { kind: "minimize" };
  }
  if (route.kind === "rotate_workspace") {
    return route;
  }
  if (route.kind === "focus_panel") {
    return { kind: "focus", panelId: route.panelId };
  }
  return { kind: "send", panelId: route.panelId, command: route.command };
}

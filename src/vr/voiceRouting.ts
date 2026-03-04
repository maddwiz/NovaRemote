import { findPanelByTarget, resolveSpatialVoiceRoute, VoiceRoutePanel } from "../spatialVoiceRoutingCore";

export type VrRoutePanel = VoiceRoutePanel;

export type VrVoiceIntent =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "send"; panelId: string; command: string }
  | { kind: "overview" }
  | { kind: "minimize" }
  | { kind: "panel_mini"; panelId: string }
  | { kind: "panel_expand"; panelId: string }
  | { kind: "panel_opacity"; panelId: string; opacity: number }
  | { kind: "rotate_workspace"; direction: "left" | "right" };

export function findVrPanelByTarget(panels: VrRoutePanel[], target: string): VrRoutePanel | null {
  return findPanelByTarget(panels, target);
}

function resolvePanelId(panels: VrRoutePanel[], focusedPanelId: string | null): string | null {
  if (focusedPanelId && panels.some((panel) => panel.id === focusedPanelId)) {
    return focusedPanelId;
  }
  return panels[0]?.id ?? null;
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const cleaned = transcript.trim();
  const panelId = resolvePanelId(panels, focusedPanelId);
  if (cleaned && panelId) {
    if (/^(?:mini|mini panel|minimize panel)$/i.test(cleaned)) {
      return { kind: "panel_mini", panelId };
    }
    if (/^(?:expand|expand panel|maximize panel)$/i.test(cleaned)) {
      return { kind: "panel_expand", panelId };
    }
    const opacityMatch = cleaned.match(/^(?:set\s+)?opacity(?:\s+to)?\s+(\d{1,3})%?$/i);
    if (opacityMatch) {
      const raw = Number.parseInt(opacityMatch[1] || "0", 10);
      const opacity = Math.max(0.2, Math.min(raw / 100, 1));
      return { kind: "panel_opacity", panelId, opacity };
    }
  }

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

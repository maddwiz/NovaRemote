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

function parseShowLogsIntent(transcript: string, panels: VrRoutePanel[]): VrVoiceIntent | null {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return null;
  }

  const allLogs = trimmed.match(/^show(?:\s+me)?\s+all\s+logs?$/i);
  if (allLogs) {
    return { kind: "overview" };
  }

  const targetMatch = trimmed.match(/^show(?:\s+me)?\s+(.+?)\s+logs?$/i);
  if (!targetMatch) {
    return null;
  }
  const target = targetMatch[1]?.trim() || "";
  if (!target) {
    return null;
  }
  const panel = findVrPanelByTarget(panels, target);
  if (!panel) {
    return null;
  }
  return { kind: "focus", panelId: panel.id };
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const showLogsIntent = parseShowLogsIntent(transcript, panels);
  if (showLogsIntent) {
    return showLogsIntent;
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

import { VrLayoutPreset } from "./contracts";
import { findPanelByTarget, resolveSpatialVoiceRoute, VoiceRoutePanel } from "../spatialVoiceRoutingCore";

export type VrRoutePanel = VoiceRoutePanel;

export type VrVoiceIntent =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "send"; panelId: string; command: string }
  | { kind: "overview" }
  | { kind: "minimize" }
  | { kind: "layout_preset"; preset: Exclude<VrLayoutPreset, "custom"> }
  | { kind: "panel_mini"; panelId: string }
  | { kind: "panel_expand"; panelId: string }
  | { kind: "panel_opacity"; panelId: string; opacity: number }
  | { kind: "rotate_workspace"; direction: "left" | "right" };

export function findVrPanelByTarget(panels: VrRoutePanel[], target: string): VrRoutePanel | null {
  return findPanelByTarget(panels, target);
}

function resolvePanelId(panels: VrRoutePanel[], focusedPanelId: string | null, target?: string | null): string | null {
  const cleanedTarget = target?.trim() || "";
  if (cleanedTarget) {
    const targetPanel = findVrPanelByTarget(panels, cleanedTarget);
    if (targetPanel) {
      return targetPanel.id;
    }
  }
  if (focusedPanelId && panels.some((panel) => panel.id === focusedPanelId)) {
    return focusedPanelId;
  }
  return panels[0]?.id ?? null;
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const cleaned = transcript.trim();
  if (cleaned) {
    const layoutMatch = cleaned.match(
      /^(?:layout|preset|snap(?:\s+layout)?)\s+(arc|grid|stacked|cockpit)$/i
    );
    if (layoutMatch) {
      return {
        kind: "layout_preset",
        preset: layoutMatch[1].toLowerCase() as Exclude<VrLayoutPreset, "custom">,
      };
    }

    const miniMatch = cleaned.match(
      /^(?:mini panel|mini|minimize panel|minimize)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (miniMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, miniMatch[1] || miniMatch[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "panel_mini", panelId };
    }

    const expandMatch = cleaned.match(
      /^(?:expand panel|expand|maximize panel|maximize)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (expandMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, expandMatch[1] || expandMatch[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "panel_expand", panelId };
    }

    const opacityWithTarget = cleaned.match(/^(?:set\s+)?opacity(?:\s+to)?\s+(\d{1,3})%?\s+(?:for|on)\s+(.+)$/i);
    if (opacityWithTarget) {
      const raw = Number.parseInt(opacityWithTarget[1] || "0", 10);
      const opacity = Math.max(0.2, Math.min(raw / 100, 1));
      const panelId = resolvePanelId(panels, focusedPanelId, opacityWithTarget[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "panel_opacity", panelId, opacity };
    }

    const targetThenOpacity = cleaned.match(/^set\s+(.+?)\s+opacity(?:\s+to)?\s+(\d{1,3})%?$/i);
    if (targetThenOpacity) {
      const raw = Number.parseInt(targetThenOpacity[2] || "0", 10);
      const opacity = Math.max(0.2, Math.min(raw / 100, 1));
      const panelId = resolvePanelId(panels, focusedPanelId, targetThenOpacity[1] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "panel_opacity", panelId, opacity };
    }

    const opacityMatch = cleaned.match(/^(?:set\s+)?opacity(?:\s+to)?\s+(\d{1,3})%?$/i);
    if (opacityMatch) {
      const raw = Number.parseInt(opacityMatch[1] || "0", 10);
      const opacity = Math.max(0.2, Math.min(raw / 100, 1));
      const panelId = resolvePanelId(panels, focusedPanelId);
      if (!panelId) {
        return { kind: "none" };
      }
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

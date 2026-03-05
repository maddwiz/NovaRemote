import { findPanelByTarget, resolveSpatialVoiceRoute, VoiceRoutePanel } from "../spatialVoiceRoutingCore";
import { VrLayoutPreset } from "./contracts";

export type VrRoutePanel = VoiceRoutePanel;

export type VrVoiceIntent =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "create_session"; serverId: string; sessionKind: "ai" | "shell"; prompt?: string }
  | { kind: "close_panel"; panelId: string }
  | { kind: "resize_panel"; panelId: string; scale: "double" | "half" | "fullscreen" | "normal" }
  | { kind: "move_panel"; panelId: string; position: "left" | "center" | "right" | "above" | "below" }
  | { kind: "swap_panels"; panelIdA: string; panelIdB: string }
  | { kind: "reconnect_server"; panelId: string }
  | { kind: "reconnect_all" }
  | { kind: "create_agent"; name: string; panelId?: string; allServers?: boolean }
  | { kind: "remove_agent"; name: string; panelId?: string; allServers?: boolean }
  | {
      kind: "set_agent_status";
      name: string;
      status: "idle" | "monitoring" | "executing" | "waiting_approval";
      panelId?: string;
      allServers?: boolean;
    }
  | { kind: "set_agent_goal"; name: string; goal: string; panelId?: string; allServers?: boolean }
  | { kind: "queue_agent_command"; name: string; command: string; panelId?: string; allServers?: boolean }
  | { kind: "approve_ready_agents"; panelId?: string }
  | { kind: "deny_all_pending_agents"; panelId?: string }
  | { kind: "pause_pool" }
  | { kind: "resume_pool" }
  | { kind: "send"; panelId: string; command: string }
  | { kind: "control"; panelId: string; char: string }
  | { kind: "stop_session"; panelId: string }
  | { kind: "open_on_mac"; panelId: string }
  | { kind: "share_live"; panelId: string }
  | { kind: "panel_pin"; panelId: string }
  | { kind: "panel_unpin"; panelId: string }
  | { kind: "panel_add"; panelId: string }
  | { kind: "panel_remove"; panelId: string }
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

function ctrlKeyFromChar(char: string): string {
  if (!char || char.length !== 1) {
    return "C-c";
  }
  const code = char.charCodeAt(0);
  if (code < 1 || code > 26) {
    return "C-c";
  }
  const letter = String.fromCharCode(code + 96);
  return `C-${letter}`;
}

function isAllServersTarget(target: string): boolean {
  const normalized = target
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return (
    normalized === "all" ||
    normalized === "all server" ||
    normalized === "all servers" ||
    normalized === "every server" ||
    normalized === "every servers" ||
    normalized === "everywhere"
  );
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const cleaned = transcript.trim();
  if (cleaned) {
    const approveReadyAgentsMatch = cleaned.match(
      /^(?:approve(?:\s+ready)?\s+agents?|approve\s+all\s+agents?|run\s+ready\s+agents?)(?:\s+(?:for|on)\s+(.+))?$/i
    );
    if (approveReadyAgentsMatch) {
      const target = approveReadyAgentsMatch[1] || null;
      if (target && isAllServersTarget(target)) {
        return { kind: "approve_ready_agents" };
      }
      const panelId = target ? resolvePanelId(panels, focusedPanelId, target) : null;
      if (target && !panelId) {
        return { kind: "none" };
      }
      return panelId ? { kind: "approve_ready_agents", panelId } : { kind: "approve_ready_agents" };
    }

    const denyPendingAgentsMatch = cleaned.match(
      /^(?:deny|reject)\s+(?:all\s+)?(?:pending\s+)?agents?(?:\s+approvals?)?(?:\s+(?:for|on)\s+(.+))?$/i
    );
    if (denyPendingAgentsMatch) {
      const target = denyPendingAgentsMatch[1] || null;
      if (target && isAllServersTarget(target)) {
        return { kind: "deny_all_pending_agents" };
      }
      const panelId = target ? resolvePanelId(panels, focusedPanelId, target) : null;
      if (target && !panelId) {
        return { kind: "none" };
      }
      return panelId ? { kind: "deny_all_pending_agents", panelId } : { kind: "deny_all_pending_agents" };
    }

    const stopSessionMatch = cleaned.match(
      /^(?:stop|terminate|halt)\s+(?:session|terminal)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (stopSessionMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, stopSessionMatch[1] || stopSessionMatch[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "stop_session", panelId };
    }

    const openOnMacMatch = cleaned.match(/^open(?:\s+(.+?))?\s+on\s+mac$/i);
    if (openOnMacMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, openOnMacMatch[1] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "open_on_mac", panelId };
    }

    const openOnMacForMatch = cleaned.match(/^open\s+on\s+mac(?:\s+(?:for|on)\s+(.+))?$/i);
    if (openOnMacForMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, openOnMacForMatch[1] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "open_on_mac", panelId };
    }

    const shareLiveMatch = cleaned.match(
      /^(?:share|create|generate)\s+(?:live|spectate|spectator)(?:\s+session)?(?:\s+link)?(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (shareLiveMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, shareLiveMatch[1] || shareLiveMatch[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "share_live", panelId };
    }

    const interruptMatch = cleaned.match(
      /^(?:interrupt|stop command|cancel command)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (interruptMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, interruptMatch[1] || interruptMatch[2] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "control", panelId, char: "C-c" };
    }

    const controlMatch = cleaned.match(
      /^(?:ctrl\s*\+?|control\s+)([a-z])(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
    );
    if (controlMatch) {
      const panelId = resolvePanelId(panels, focusedPanelId, controlMatch[2] || controlMatch[3] || null);
      if (!panelId) {
        return { kind: "none" };
      }
      return { kind: "control", panelId, char: `C-${(controlMatch[1] || "c").toLowerCase()}` };
    }

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
  if (route.kind === "create_session") {
    return {
      kind: "create_session",
      serverId: route.serverId,
      sessionKind: route.sessionKind,
      prompt: route.prompt,
    };
  }
  if (route.kind === "close_panel") {
    return {
      kind: "close_panel",
      panelId: route.panelId,
    };
  }
  if (route.kind === "resize_panel") {
    return {
      kind: "resize_panel",
      panelId: route.panelId,
      scale: route.scale,
    };
  }
  if (route.kind === "move_panel") {
    return {
      kind: "move_panel",
      panelId: route.panelId,
      position: route.position,
    };
  }
  if (route.kind === "swap_panels") {
    return {
      kind: "swap_panels",
      panelIdA: route.panelIdA,
      panelIdB: route.panelIdB,
    };
  }
  if (route.kind === "reconnect_server") {
    return {
      kind: "reconnect_server",
      panelId: route.panelId,
    };
  }
  if (route.kind === "reconnect_all") {
    return {
      kind: "reconnect_all",
    };
  }
  if (route.kind === "create_agent") {
    return route.panelId
      ? {
          kind: "create_agent",
          name: route.name,
          panelId: route.panelId,
          allServers: route.allServers,
        }
      : {
          kind: "create_agent",
          name: route.name,
          allServers: route.allServers,
        };
  }
  if (route.kind === "remove_agent") {
    return route.panelId
      ? {
          kind: "remove_agent",
          name: route.name,
          panelId: route.panelId,
          allServers: route.allServers,
        }
      : {
          kind: "remove_agent",
          name: route.name,
          allServers: route.allServers,
        };
  }
  if (route.kind === "set_agent_status") {
    return route.panelId
      ? {
          kind: "set_agent_status",
          name: route.name,
          status: route.status,
          panelId: route.panelId,
          allServers: route.allServers,
        }
      : {
          kind: "set_agent_status",
          name: route.name,
          status: route.status,
          allServers: route.allServers,
        };
  }
  if (route.kind === "set_agent_goal") {
    return route.panelId
      ? {
          kind: "set_agent_goal",
          name: route.name,
          goal: route.goal,
          panelId: route.panelId,
          allServers: route.allServers,
        }
      : {
          kind: "set_agent_goal",
          name: route.name,
          goal: route.goal,
          allServers: route.allServers,
        };
  }
  if (route.kind === "queue_agent_command") {
    return route.panelId
      ? {
          kind: "queue_agent_command",
          name: route.name,
          command: route.command,
          panelId: route.panelId,
          allServers: route.allServers,
        }
      : {
          kind: "queue_agent_command",
          name: route.name,
          command: route.command,
          allServers: route.allServers,
        };
  }
  if (route.kind === "approve_ready_agents") {
    return route.panelId
      ? {
          kind: "approve_ready_agents",
          panelId: route.panelId,
        }
      : {
          kind: "approve_ready_agents",
        };
  }
  if (route.kind === "deny_all_pending_agents") {
    return route.panelId
      ? {
          kind: "deny_all_pending_agents",
          panelId: route.panelId,
        }
      : {
          kind: "deny_all_pending_agents",
        };
  }
  if (route.kind === "pause_pool") {
    return {
      kind: "pause_pool",
    };
  }
  if (route.kind === "resume_pool") {
    return {
      kind: "resume_pool",
    };
  }
  if (route.kind === "control_char") {
    return {
      kind: "control",
      panelId: route.panelId,
      char: ctrlKeyFromChar(route.char),
    };
  }
  if (route.kind === "stop_session") {
    return {
      kind: "stop_session",
      panelId: route.panelId,
    };
  }
  if (route.kind === "open_on_mac") {
    return {
      kind: "open_on_mac",
      panelId: route.panelId,
    };
  }
  if (route.kind === "share_live") {
    return {
      kind: "share_live",
      panelId: route.panelId,
    };
  }
  if (route.kind === "pin_panel") {
    return {
      kind: "panel_pin",
      panelId: route.panelId,
    };
  }
  if (route.kind === "unpin_panel") {
    return {
      kind: "panel_unpin",
      panelId: route.panelId,
    };
  }
  if (route.kind === "add_panel") {
    return {
      kind: "panel_add",
      panelId: route.panelId,
    };
  }
  if (route.kind === "remove_panel") {
    return {
      kind: "panel_remove",
      panelId: route.panelId,
    };
  }
  if (route.kind !== "send_command") {
    return { kind: "none" };
  }
  return { kind: "send", panelId: route.panelId, command: route.command };
}

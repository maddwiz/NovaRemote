import { useCallback, useEffect, useRef, useState } from "react";

import { VrGestureEvent } from "./inputGestures";
import { VrWorkspaceGestureAction, VrWorkspaceVoiceAction } from "./useVrWorkspace";

type WorkspaceInputBridge = {
  applyVoiceTranscript: (
    transcript: string,
    options?: {
      targetPanelId?: string | null;
    }
  ) => VrWorkspaceVoiceAction;
  applyGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
  setOverviewMode?: (enabled: boolean) => void;
};

export type VrHudStatus = {
  message: string;
  severity: "info" | "success" | "warning" | "error";
  at: number;
} | null;

export type UseVrInputRouterArgs = {
  workspace: WorkspaceInputBridge;
  onSendCommand: (serverId: string, session: string, command: string) => Promise<void> | void;
  onCreateSession?: (serverId: string, kind: "ai" | "shell", prompt?: string) => Promise<string> | string;
  onSendControlChar?: (serverId: string, session: string, char: string) => Promise<void> | void;
  onReconnectServer?: (serverId: string) => Promise<void> | void;
  onReconnectServers?: (serverIds: string[]) => Promise<void> | void;
  onCreateAgent?: (serverIds: string[], name: string) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
  onRemoveAgent?: (serverIds: string[], name: string) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
  onSetAgentStatus?: (
    serverIds: string[],
    name: string,
    status: "idle" | "monitoring" | "executing" | "waiting_approval"
  ) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
  onSetAgentGoal?: (
    serverIds: string[],
    name: string,
    goal: string
  ) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
  onQueueAgentCommand?: (
    serverIds: string[],
    name: string,
    command: string
  ) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
  onApproveReadyAgents?: (serverIds: string[]) => Promise<void | number | string[]> | void | number | string[];
  onDenyAllPendingAgents?: (serverIds: string[]) => Promise<void | number | string[]> | void | number | string[];
  onConnectAllServers?: () => Promise<void> | void;
  onDisconnectAllServers?: () => Promise<void> | void;
  onStopSession?: (serverId: string, session: string) => Promise<void> | void;
  onOpenOnMac?: (serverId: string, session: string) => Promise<void> | void;
  onShareLive?: (serverId: string, session: string) => Promise<void> | void;
  onSetOverviewMode?: (enabled: boolean) => void;
  hudAutoClearMs?: number;
};

export type UseVrInputRouterResult = {
  hudStatus: VrHudStatus;
  clearHudStatus: () => void;
  dispatchVoice: (
    transcript: string,
    options?: {
      targetPanelId?: string | null;
    }
  ) => Promise<VrWorkspaceVoiceAction>;
  dispatchGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
};

function now(): number {
  return Date.now();
}

function resolveActionCount(result: void | number | boolean | string[] | null | undefined): number | null {
  if (typeof result === "number" && Number.isFinite(result)) {
    return Math.max(0, Math.floor(result));
  }
  if (typeof result === "boolean") {
    return result ? 1 : 0;
  }
  if (Array.isArray(result)) {
    return result.length;
  }
  return null;
}

export function useVrInputRouter({
  workspace,
  onSendCommand,
  onCreateSession,
  onSendControlChar,
  onReconnectServer,
  onReconnectServers,
  onCreateAgent,
  onRemoveAgent,
  onSetAgentStatus,
  onSetAgentGoal,
  onQueueAgentCommand,
  onApproveReadyAgents,
  onDenyAllPendingAgents,
  onConnectAllServers,
  onDisconnectAllServers,
  onStopSession,
  onOpenOnMac,
  onShareLive,
  onSetOverviewMode,
  hudAutoClearMs = 3000,
}: UseVrInputRouterArgs): UseVrInputRouterResult {
  const [hudStatus, setHudStatus] = useState<VrHudStatus>(null);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const publishHudStatus = useCallback(
    (next: VrHudStatus) => {
      setHudStatus(next);
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
      if (!next || hudAutoClearMs <= 0) {
        return;
      }
      clearTimerRef.current = setTimeout(() => {
        clearTimerRef.current = null;
        setHudStatus(null);
      }, hudAutoClearMs);
    },
    [hudAutoClearMs]
  );

  const clearHudStatus = useCallback(() => {
    if (clearTimerRef.current) {
      clearTimeout(clearTimerRef.current);
      clearTimerRef.current = null;
    }
    publishHudStatus(null);
  }, [publishHudStatus]);

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) {
        clearTimeout(clearTimerRef.current);
        clearTimerRef.current = null;
      }
    };
  }, []);

  const dispatchVoice = useCallback(
    async (
      transcript: string,
      options?: {
        targetPanelId?: string | null;
      }
    ): Promise<VrWorkspaceVoiceAction> => {
      const action = workspace.applyVoiceTranscript(transcript, {
        targetPanelId: options?.targetPanelId ?? null,
      });

      if (action.kind === "send") {
        try {
          await onSendCommand(action.serverId, action.session, action.command);
          publishHudStatus({
            message: `Sent to ${action.serverId}/${action.session}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to send command",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "create_session") {
        if (!onCreateSession) {
          publishHudStatus({
            message: "Session creation routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const session = await onCreateSession(action.serverId, action.sessionKind, action.prompt);
          publishHudStatus({
            message: `Started ${action.sessionKind} session ${session} on ${action.serverId}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to create session",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "control") {
        if (!onSendControlChar) {
          publishHudStatus({
            message: "Control routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onSendControlChar(action.serverId, action.session, action.char);
          publishHudStatus({
            message: `Sent ${action.char} to ${action.serverId}/${action.session}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to send control character",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "reconnect_server") {
        if (!onReconnectServer) {
          publishHudStatus({
            message: "Reconnect is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onReconnectServer(action.serverId);
          publishHudStatus({
            message: `Reconnect queued for ${action.serverId}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to reconnect server",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "reconnect_all") {
        if (onReconnectServers) {
          try {
            await onReconnectServers(action.serverIds);
            publishHudStatus({
              message: `Reconnect queued for ${action.serverIds.length} servers`,
              severity: "success",
              at: now(),
            });
          } catch (error) {
            publishHudStatus({
              message: error instanceof Error ? error.message : "Failed to reconnect all servers",
              severity: "error",
              at: now(),
            });
          }
          return action;
        }
        if (!onReconnectServer) {
          publishHudStatus({
            message: "Reconnect is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          for (const serverId of action.serverIds) {
            await onReconnectServer(serverId);
          }
          publishHudStatus({
            message: `Reconnect queued for ${action.serverIds.length} servers`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to reconnect all servers",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "create_agent") {
        if (!onCreateAgent) {
          publishHudStatus({
            message: "Agent creation routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onCreateAgent(action.serverIds, action.name);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? `No agents were created for ${action.name}`
                : count === null
                  ? `Created agent ${action.name}`
                  : `Created ${count} agent${count === 1 ? "" : "s"} named ${action.name}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to create agent",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "set_agent_goal") {
        if (!onSetAgentGoal) {
          publishHudStatus({
            message: "Agent goal routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onSetAgentGoal(action.serverIds, action.name, action.goal);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? `No agent goals updated for ${action.name}`
                : count === null
                  ? `Updated goal for ${action.name}`
                  : `Updated goal for ${count} agent${count === 1 ? "" : "s"}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to update agent goal",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "remove_agent") {
        if (!onRemoveAgent) {
          publishHudStatus({
            message: "Agent removal routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onRemoveAgent(action.serverIds, action.name);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? `No agents were removed for ${action.name}`
                : count === null
                  ? `Removed agent ${action.name}`
                  : `Removed ${count} agent${count === 1 ? "" : "s"} named ${action.name}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to remove agent",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "set_agent_status") {
        if (!onSetAgentStatus) {
          publishHudStatus({
            message: "Agent status routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onSetAgentStatus(action.serverIds, action.name, action.status);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? `No agent statuses updated for ${action.name}`
                : count === null
                  ? `Set status for ${action.name}`
                  : `Set status for ${count} agent${count === 1 ? "" : "s"}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to update agent status",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "queue_agent_command") {
        if (!onQueueAgentCommand) {
          publishHudStatus({
            message: "Agent command queue routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onQueueAgentCommand(action.serverIds, action.name, action.command);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? `No pending approvals queued for ${action.name}`
                : count === null
                  ? `Queued pending approval for ${action.name}`
                  : `Queued ${count} pending approval${count === 1 ? "" : "s"} for ${action.name}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to queue agent command",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "approve_ready_agents") {
        if (!onApproveReadyAgents) {
          publishHudStatus({
            message: "Agent approval routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onApproveReadyAgents(action.serverIds);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? "No ready agent approvals found"
                : count === null
                  ? "Approved ready agent queue"
                  : `Approved ${count} ready agent approval${count === 1 ? "" : "s"}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to approve ready agents",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "deny_all_pending_agents") {
        if (!onDenyAllPendingAgents) {
          publishHudStatus({
            message: "Agent denial routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          const result = await onDenyAllPendingAgents(action.serverIds);
          const count = resolveActionCount(result);
          publishHudStatus({
            message:
              count === 0
                ? "No pending agent approvals to deny"
                : count === null
                  ? "Denied pending agent approvals"
                  : `Denied ${count} pending agent approval${count === 1 ? "" : "s"}`,
            severity: count === 0 ? "warning" : "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to deny pending agents",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "pause_pool") {
        if (!onDisconnectAllServers) {
          publishHudStatus({
            message: "Pool pause is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onDisconnectAllServers();
          publishHudStatus({
            message: "Connection pool paused",
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to pause connection pool",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "resume_pool") {
        if (!onConnectAllServers) {
          publishHudStatus({
            message: "Pool resume is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onConnectAllServers();
          publishHudStatus({
            message: "Connection pool resumed",
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to resume connection pool",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "stop_session") {
        if (!onStopSession && !onSendControlChar) {
          publishHudStatus({
            message: "Session stop is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          if (onStopSession) {
            await onStopSession(action.serverId, action.session);
          } else {
            await onSendControlChar?.(action.serverId, action.session, "\u0003");
          }
          publishHudStatus({
            message: onStopSession
              ? action.closePanel
                ? `Stopped and closed ${action.serverId}/${action.session}`
                : `Stopped ${action.serverId}/${action.session}`
              : action.closePanel
                ? `Sent Ctrl-C and closed ${action.serverId}/${action.session}`
                : `Sent Ctrl-C to ${action.serverId}/${action.session}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to stop session",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "open_on_mac") {
        if (!onOpenOnMac) {
          publishHudStatus({
            message: "Open-on-Mac is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onOpenOnMac(action.serverId, action.session);
          publishHudStatus({
            message: `Opened ${action.serverId}/${action.session} on Mac`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to open session on Mac",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "share_live") {
        if (!onShareLive) {
          publishHudStatus({
            message: "Live sharing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        try {
          await onShareLive(action.serverId, action.session);
          publishHudStatus({
            message: `Shared live link for ${action.serverId}/${action.session}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          publishHudStatus({
            message: error instanceof Error ? error.message : "Failed to create live share link",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }

      if (action.kind === "focus") {
        publishHudStatus({
          message: `Focused panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "rotate_workspace") {
        publishHudStatus({
          message: `Rotated workspace ${action.direction}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "overview") {
        workspace.setOverviewMode?.(true);
        onSetOverviewMode?.(true);
        publishHudStatus({
          message: "Overview mode",
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "none") {
        return action;
      }

      if (action.kind === "panel_pin") {
        publishHudStatus({
          message: `Pinned panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_unpin") {
        publishHudStatus({
          message: `Unpinned panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "resize_panel") {
        publishHudStatus({
          message: `Resized panel ${action.panelId} to ${action.scale}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "move_panel") {
        publishHudStatus({
          message: `Moved panel ${action.panelId} to ${action.position}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "swap_panels") {
        publishHudStatus({
          message: `Swapped panels ${action.panelIdA} and ${action.panelIdB}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_add") {
        publishHudStatus({
          message: `Added panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_remove") {
        publishHudStatus({
          message: `Removed panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_mini") {
        publishHudStatus({
          message: `Mini panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_expand") {
        publishHudStatus({
          message: `Expanded panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "panel_opacity") {
        publishHudStatus({
          message: `Panel opacity ${Math.round(action.opacity * 100)}%`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      if (action.kind === "layout_preset") {
        publishHudStatus({
          message: `Layout preset ${action.preset}`,
          severity: "info",
          at: now(),
        });
        return action;
      }

      workspace.setOverviewMode?.(false);
      onSetOverviewMode?.(false);
      publishHudStatus({
        message: "Focus mode",
        severity: "info",
        at: now(),
      });
      return action;
    },
    [
      onConnectAllServers,
      onApproveReadyAgents,
      onDenyAllPendingAgents,
      onDisconnectAllServers,
      onOpenOnMac,
      onShareLive,
      onReconnectServer,
      onReconnectServers,
      onCreateAgent,
      onRemoveAgent,
      onSetAgentStatus,
      onSetAgentGoal,
      onQueueAgentCommand,
      onCreateSession,
      onSendCommand,
      onSendControlChar,
      onSetOverviewMode,
      onStopSession,
      publishHudStatus,
      workspace,
    ]
  );

  const dispatchGesture = useCallback(
    (event: VrGestureEvent): VrWorkspaceGestureAction => {
      const action = workspace.applyGesture(event);
      if (action.kind === "rotate_workspace") {
        publishHudStatus({
          message: `Rotated workspace ${action.direction}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "focus") {
        publishHudStatus({
          message: `Focused panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "snap_layout") {
        publishHudStatus({
          message: `Snapped layout ${action.preset}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "approve_ready_agents") {
        if (!onApproveReadyAgents) {
          publishHudStatus({
            message: "Agent approval routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        void Promise.resolve(onApproveReadyAgents(action.serverIds))
          .then((result) => {
            const count = resolveActionCount(result);
            publishHudStatus({
              message:
                count === 0
                  ? "No ready agent approvals found"
                  : count === null
                    ? "Approved ready agent queue"
                    : `Approved ${count} ready agent approval${count === 1 ? "" : "s"}`,
              severity: count === 0 ? "warning" : "success",
              at: now(),
            });
          })
          .catch((error) => {
            publishHudStatus({
              message: error instanceof Error ? error.message : "Failed to approve ready agents",
              severity: "error",
              at: now(),
            });
          });
        return action;
      }
      if (action.kind === "deny_all_pending_agents") {
        if (!onDenyAllPendingAgents) {
          publishHudStatus({
            message: "Agent denial routing is unavailable",
            severity: "warning",
            at: now(),
          });
          return action;
        }
        void Promise.resolve(onDenyAllPendingAgents(action.serverIds))
          .then((result) => {
            const count = resolveActionCount(result);
            publishHudStatus({
              message:
                count === 0
                  ? "No pending agent approvals to deny"
                  : count === null
                    ? "Denied pending agent approvals"
                    : `Denied ${count} pending agent approval${count === 1 ? "" : "s"}`,
              severity: count === 0 ? "warning" : "success",
              at: now(),
            });
          })
          .catch((error) => {
            publishHudStatus({
              message: error instanceof Error ? error.message : "Failed to deny pending agents",
              severity: "error",
              at: now(),
            });
          });
        return action;
      }
      if (action.kind === "overview") {
        workspace.setOverviewMode?.(true);
        onSetOverviewMode?.(true);
        publishHudStatus({
          message: "Overview mode",
          severity: "info",
          at: now(),
        });
      }
      return action;
    },
    [onApproveReadyAgents, onDenyAllPendingAgents, onSetOverviewMode, publishHudStatus, workspace]
  );

  return {
    hudStatus,
    clearHudStatus,
    dispatchVoice,
    dispatchGesture,
  };
}

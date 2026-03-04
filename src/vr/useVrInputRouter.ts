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
  onSendControlChar?: (serverId: string, session: string, char: string) => Promise<void> | void;
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

export function useVrInputRouter({
  workspace,
  onSendCommand,
  onSendControlChar,
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
      if (action.kind === "minimize") {
        workspace.setOverviewMode?.(false);
      }
      onSetOverviewMode?.(false);
      publishHudStatus({
        message: "Focus mode",
        severity: "info",
        at: now(),
      });
      return action;
    },
    [onSendCommand, onSendControlChar, onSetOverviewMode, publishHudStatus, workspace]
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
    [onSetOverviewMode, publishHudStatus, workspace]
  );

  return {
    hudStatus,
    clearHudStatus,
    dispatchVoice,
    dispatchGesture,
  };
}

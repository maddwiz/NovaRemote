import { useCallback, useState } from "react";

import { VrGestureEvent } from "./inputGestures";
import { VrWorkspaceGestureAction, VrWorkspaceVoiceAction } from "./useVrWorkspace";

type WorkspaceInputBridge = {
  applyVoiceTranscript: (transcript: string) => VrWorkspaceVoiceAction;
  applyGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
};

export type VrHudStatus = {
  message: string;
  severity: "info" | "success" | "warning" | "error";
  at: number;
} | null;

export type UseVrInputRouterArgs = {
  workspace: WorkspaceInputBridge;
  onSendCommand: (serverId: string, session: string, command: string) => Promise<void> | void;
  onSetOverviewMode?: (enabled: boolean) => void;
};

export type UseVrInputRouterResult = {
  hudStatus: VrHudStatus;
  clearHudStatus: () => void;
  dispatchVoice: (transcript: string) => Promise<VrWorkspaceVoiceAction>;
  dispatchGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
};

function now(): number {
  return Date.now();
}

export function useVrInputRouter({
  workspace,
  onSendCommand,
  onSetOverviewMode,
}: UseVrInputRouterArgs): UseVrInputRouterResult {
  const [hudStatus, setHudStatus] = useState<VrHudStatus>(null);

  const clearHudStatus = useCallback(() => {
    setHudStatus(null);
  }, []);

  const dispatchVoice = useCallback(
    async (transcript: string): Promise<VrWorkspaceVoiceAction> => {
      const action = workspace.applyVoiceTranscript(transcript);
      if (action.kind === "send") {
        try {
          await onSendCommand(action.serverId, action.session, action.command);
          setHudStatus({
            message: `Sent to ${action.serverId}/${action.session}`,
            severity: "success",
            at: now(),
          });
        } catch (error) {
          setHudStatus({
            message: error instanceof Error ? error.message : "Failed to send command",
            severity: "error",
            at: now(),
          });
        }
        return action;
      }
      if (action.kind === "focus") {
        setHudStatus({
          message: `Focused panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "rotate_workspace") {
        setHudStatus({
          message: `Rotated workspace ${action.direction}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "overview") {
        onSetOverviewMode?.(true);
        setHudStatus({
          message: "Overview mode",
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "none") {
        return action;
      }
      onSetOverviewMode?.(false);
      setHudStatus({
        message: "Focus mode",
        severity: "info",
        at: now(),
      });
      return action;
    },
    [onSendCommand, onSetOverviewMode, workspace]
  );

  const dispatchGesture = useCallback(
    (event: VrGestureEvent): VrWorkspaceGestureAction => {
      const action = workspace.applyGesture(event);
      if (action.kind === "rotate_workspace") {
        setHudStatus({
          message: `Rotated workspace ${action.direction}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "focus") {
        setHudStatus({
          message: `Focused panel ${action.panelId}`,
          severity: "info",
          at: now(),
        });
        return action;
      }
      if (action.kind === "overview") {
        onSetOverviewMode?.(true);
        setHudStatus({
          message: "Overview mode",
          severity: "info",
          at: now(),
        });
      }
      return action;
    },
    [onSetOverviewMode, workspace]
  );

  return {
    hudStatus,
    clearHudStatus,
    dispatchVoice,
    dispatchGesture,
  };
}

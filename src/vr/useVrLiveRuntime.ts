import { useCallback, useEffect, useMemo, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

import { ServerConnection } from "../types";
import { VrLayoutPreset } from "./contracts";
import { createVrSessionClient, VrServerTarget, VrSessionClient } from "./sessionClient";
import { createVrStreamPool, VrStreamCallbacks, VrStreamPool } from "./streamPool";
import { useVrInputRouter } from "./useVrInputRouter";
import { useVrWorkspace } from "./useVrWorkspace";

export type UseVrLiveRuntimeArgs = {
  connections: Map<string, ServerConnection>;
  maxPanels?: number;
  initialPreset?: VrLayoutPreset;
  sessionClient?: VrSessionClient;
  streamPool?: VrStreamPool;
  autoSyncWorkspacePanelStreams?: boolean;
  autoSyncWorkspacePanelIds?: string[];
  workspaceStreamCallbacks?: VrWorkspaceStreamCallbacks;
  pauseWorkspaceStreamsOnAppBackground?: boolean;
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
  onShareLive?: (serverId: string, session: string) => Promise<void> | void;
};

export type VrWorkspaceStreamCallbacks = {
  onSnapshot?: (serverId: string, session: string, output: string) => void;
  onDelta?: (serverId: string, session: string, delta: string) => void;
  onSessionClosed?: (serverId: string, session: string) => void;
  onError?: (serverId: string, session: string, message: string) => void;
  onStatus?: (
    serverId: string,
    session: string,
    status: "connecting" | "connected" | "reconnecting" | "disconnected",
    retryCount: number
  ) => void;
};

function makePanelStreamKey(serverId: string, session: string): string {
  return `${serverId}::${session}`;
}

export function useVrLiveRuntime({
  connections,
  maxPanels,
  initialPreset,
  sessionClient,
  streamPool,
  autoSyncWorkspacePanelStreams = false,
  autoSyncWorkspacePanelIds,
  workspaceStreamCallbacks,
  pauseWorkspaceStreamsOnAppBackground = true,
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
  onShareLive,
}: UseVrLiveRuntimeArgs) {
  const workspace = useVrWorkspace({
    connections,
    maxPanels,
    initialPreset,
  });

  const liveClient = useMemo(() => sessionClient || createVrSessionClient(), [sessionClient]);
  const liveStreamPool = useMemo(() => streamPool || createVrStreamPool(), [streamPool]);
  const managedPanelStreamsRef = useRef<Map<string, { serverId: string; session: string }>>(new Map());

  useEffect(() => {
    return () => {
      liveStreamPool.closeAll();
    };
  }, [liveStreamPool]);

  const resolveServerTarget = useCallback((serverId: string): { target: VrServerTarget; connection: ServerConnection } => {
    const connection = connections.get(serverId);
    if (!connection) {
      throw new Error(`Unknown VR server target: ${serverId}`);
    }
    const { server } = connection;
    if (!server.baseUrl.trim() || !server.token.trim()) {
      throw new Error(`Missing server credentials for VR target: ${server.name}`);
    }
    return {
      connection,
      target: {
        id: server.id,
        name: server.name,
        baseUrl: server.baseUrl,
        token: server.token,
      },
    };
  }, [connections]);

  const sendServerCommand = useCallback(
    async (serverId: string, session: string, command: string) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.send(target, connection.terminalApiBasePath, session, command, true);
    },
    [liveClient, resolveServerTarget]
  );

  const sendServerControlChar = useCallback(
    async (serverId: string, session: string, char: string) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.ctrl(target, connection.terminalApiBasePath, session, char);
    },
    [liveClient, resolveServerTarget]
  );

  const listServerSessions = useCallback(
    async (serverId: string) => {
      const { connection, target } = resolveServerTarget(serverId);
      return await liveClient.listSessions(target, connection.terminalApiBasePath);
    },
    [liveClient, resolveServerTarget]
  );

  const createServerSession = useCallback(
    async (serverId: string, session: string, cwd: string) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.createSession(target, connection.terminalApiBasePath, session, cwd);
    },
    [liveClient, resolveServerTarget]
  );

  const stopServerSession = useCallback(
    async (serverId: string, session: string) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.stopSession(target, connection.terminalApiBasePath, session);
    },
    [liveClient, resolveServerTarget]
  );

  const openServerOnMac = useCallback(
    async (serverId: string, session: string) => {
      const { target } = resolveServerTarget(serverId);
      await liveClient.openOnMac(target, session);
    },
    [liveClient, resolveServerTarget]
  );

  const fetchServerTail = useCallback(
    async (serverId: string, session: string, lines?: number) => {
      const { connection, target } = resolveServerTarget(serverId);
      return await liveClient.tail(target, connection.terminalApiBasePath, session, lines);
    },
    [liveClient, resolveServerTarget]
  );

  const pingServerHealth = useCallback(
    async (serverId: string) => {
      const { target } = resolveServerTarget(serverId);
      return await liveClient.health(target);
    },
    [liveClient, resolveServerTarget]
  );

  const subscribeServerSessionStream = useCallback(
    (serverId: string, session: string, callbacks?: VrStreamCallbacks) => {
      const { connection, target } = resolveServerTarget(serverId);
      return liveStreamPool.openStream({
        server: target,
        basePath: connection.terminalApiBasePath,
        session,
        callbacks,
      });
    },
    [liveStreamPool, resolveServerTarget]
  );

  const unsubscribeServerSessionStream = useCallback(
    (serverId: string, session: string) => {
      liveStreamPool.closeStream(serverId, session);
    },
    [liveStreamPool]
  );

  const pauseServerStreams = useCallback(() => {
    liveStreamPool.pause();
  }, [liveStreamPool]);

  const resumeServerStreams = useCallback(() => {
    liveStreamPool.resume();
  }, [liveStreamPool]);

  const closeServerStreams = useCallback(
    (serverId: string) => {
      liveStreamPool.closeServer(serverId);
    },
    [liveStreamPool]
  );

  const closeAllServerStreams = useCallback(() => {
    liveStreamPool.closeAll();
  }, [liveStreamPool]);

  const getStreamPoolSnapshot = useCallback(
    () => ({
      paused: liveStreamPool.isPaused(),
      tracked: liveStreamPool.trackedStreamCount(),
      active: liveStreamPool.activeStreamCount(),
      managed: managedPanelStreamsRef.current.size,
    }),
    [liveStreamPool]
  );

  const syncWorkspacePanelStreams = useCallback(
    (callbacks?: VrWorkspaceStreamCallbacks, panelIds?: string[]) => {
      const allowedPanelIds = panelIds ? new Set(panelIds) : null;
      const desired = workspace.panels.filter((panel) => (allowedPanelIds ? allowedPanelIds.has(panel.id) : true));
      const desiredKeys = new Set<string>();

      desired.forEach((panel) => {
        const key = makePanelStreamKey(panel.serverId, panel.session);
        desiredKeys.add(key);
        subscribeServerSessionStream(panel.serverId, panel.session, {
          onSnapshot: (output) => callbacks?.onSnapshot?.(panel.serverId, panel.session, output),
          onDelta: (delta) => callbacks?.onDelta?.(panel.serverId, panel.session, delta),
          onSessionClosed: () => callbacks?.onSessionClosed?.(panel.serverId, panel.session),
          onError: (message) => callbacks?.onError?.(panel.serverId, panel.session, message),
          onStatus: (status, retryCount) =>
            callbacks?.onStatus?.(panel.serverId, panel.session, status, retryCount),
        });
        managedPanelStreamsRef.current.set(key, {
          serverId: panel.serverId,
          session: panel.session,
        });
      });

      Array.from(managedPanelStreamsRef.current.entries()).forEach(([key, value]) => {
        if (desiredKeys.has(key)) {
          return;
        }
        unsubscribeServerSessionStream(value.serverId, value.session);
        managedPanelStreamsRef.current.delete(key);
      });
    },
    [subscribeServerSessionStream, unsubscribeServerSessionStream, workspace.panels]
  );

  const clearWorkspacePanelStreams = useCallback(() => {
    Array.from(managedPanelStreamsRef.current.values()).forEach((value) => {
      unsubscribeServerSessionStream(value.serverId, value.session);
    });
    managedPanelStreamsRef.current.clear();
  }, [unsubscribeServerSessionStream]);

  useEffect(() => {
    if (!autoSyncWorkspacePanelStreams) {
      return;
    }
    const panelIds = autoSyncWorkspacePanelIds && autoSyncWorkspacePanelIds.length > 0
      ? autoSyncWorkspacePanelIds
      : undefined;
    syncWorkspacePanelStreams(workspaceStreamCallbacks, panelIds);
    return () => {
      clearWorkspacePanelStreams();
    };
  }, [
    autoSyncWorkspacePanelIds,
    autoSyncWorkspacePanelStreams,
    clearWorkspacePanelStreams,
    syncWorkspacePanelStreams,
    workspaceStreamCallbacks,
  ]);

  useEffect(() => {
    if (!autoSyncWorkspacePanelStreams || !pauseWorkspaceStreamsOnAppBackground) {
      return;
    }

    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        resumeServerStreams();
        const panelIds = autoSyncWorkspacePanelIds && autoSyncWorkspacePanelIds.length > 0
          ? autoSyncWorkspacePanelIds
          : undefined;
        syncWorkspacePanelStreams(workspaceStreamCallbacks, panelIds);
        return;
      }
      pauseServerStreams();
    };

    const subscription = AppState.addEventListener("change", handleAppState);
    if (AppState.currentState && AppState.currentState !== "active") {
      handleAppState(AppState.currentState);
    }
    return () => {
      subscription.remove();
    };
  }, [
    autoSyncWorkspacePanelIds,
    autoSyncWorkspacePanelStreams,
    pauseWorkspaceStreamsOnAppBackground,
    pauseServerStreams,
    resumeServerStreams,
    syncWorkspacePanelStreams,
    workspaceStreamCallbacks,
  ]);

  const input = useVrInputRouter({
    workspace,
    onSetOverviewMode: workspace.setOverviewMode,
    onSendCommand: sendServerCommand,
    onSendControlChar: sendServerControlChar,
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
    onStopSession: stopServerSession,
    onOpenOnMac: openServerOnMac,
    onShareLive,
  });

  return {
    workspace,
    input,
    listServerSessions,
    createServerSession,
    stopServerSession,
    openServerOnMac,
    fetchServerTail,
    pingServerHealth,
    subscribeServerSessionStream,
    unsubscribeServerSessionStream,
    pauseServerStreams,
    resumeServerStreams,
    closeServerStreams,
    closeAllServerStreams,
    getStreamPoolSnapshot,
    syncWorkspacePanelStreams,
    clearWorkspacePanelStreams,
    sendServerCommand,
    sendServerControlChar,
    hudStatus: input.hudStatus,
    clearHudStatus: input.clearHudStatus,
    dispatchVoice: input.dispatchVoice,
    dispatchGesture: input.dispatchGesture,
  };
}

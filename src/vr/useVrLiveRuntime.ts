import { useCallback, useEffect, useMemo } from "react";

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
  onReconnectServer?: (serverId: string) => Promise<void> | void;
  onReconnectServers?: (serverIds: string[]) => Promise<void> | void;
  onCreateAgent?: (serverIds: string[], name: string) => Promise<void | number | boolean | string[]> | void | number | boolean | string[];
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
};

export function useVrLiveRuntime({
  connections,
  maxPanels,
  initialPreset,
  sessionClient,
  streamPool,
  onReconnectServer,
  onReconnectServers,
  onCreateAgent,
  onSetAgentGoal,
  onQueueAgentCommand,
  onApproveReadyAgents,
  onDenyAllPendingAgents,
  onConnectAllServers,
  onDisconnectAllServers,
}: UseVrLiveRuntimeArgs) {
  const workspace = useVrWorkspace({
    connections,
    maxPanels,
    initialPreset,
  });

  const liveClient = useMemo(() => sessionClient || createVrSessionClient(), [sessionClient]);
  const liveStreamPool = useMemo(() => streamPool || createVrStreamPool(), [streamPool]);

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
    }),
    [liveStreamPool]
  );

  const input = useVrInputRouter({
    workspace,
    onSetOverviewMode: workspace.setOverviewMode,
    onSendCommand: sendServerCommand,
    onSendControlChar: sendServerControlChar,
    onReconnectServer,
    onReconnectServers,
    onCreateAgent,
    onSetAgentGoal,
    onQueueAgentCommand,
    onApproveReadyAgents,
    onDenyAllPendingAgents,
    onConnectAllServers,
    onDisconnectAllServers,
    onStopSession: stopServerSession,
    onOpenOnMac: openServerOnMac,
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
    sendServerCommand,
    sendServerControlChar,
    hudStatus: input.hudStatus,
    clearHudStatus: input.clearHudStatus,
    dispatchVoice: input.dispatchVoice,
    dispatchGesture: input.dispatchGesture,
  };
}

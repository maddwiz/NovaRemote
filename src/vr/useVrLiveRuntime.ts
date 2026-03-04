import { useCallback, useMemo } from "react";

import { ServerConnection } from "../types";
import { VrLayoutPreset } from "./contracts";
import { createVrSessionClient, VrServerTarget, VrSessionClient } from "./sessionClient";
import { useVrInputRouter } from "./useVrInputRouter";
import { useVrWorkspace } from "./useVrWorkspace";

export type UseVrLiveRuntimeArgs = {
  connections: Map<string, ServerConnection>;
  maxPanels?: number;
  initialPreset?: VrLayoutPreset;
  sessionClient?: VrSessionClient;
};

export function useVrLiveRuntime({
  connections,
  maxPanels,
  initialPreset,
  sessionClient,
}: UseVrLiveRuntimeArgs) {
  const workspace = useVrWorkspace({
    connections,
    maxPanels,
    initialPreset,
  });

  const liveClient = useMemo(() => sessionClient || createVrSessionClient(), [sessionClient]);

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

  const input = useVrInputRouter({
    workspace,
    onSetOverviewMode: workspace.setOverviewMode,
    onSendCommand: sendServerCommand,
    onSendControlChar: sendServerControlChar,
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
    sendServerCommand,
    sendServerControlChar,
    hudStatus: input.hudStatus,
    clearHudStatus: input.clearHudStatus,
    dispatchVoice: input.dispatchVoice,
    dispatchGesture: input.dispatchGesture,
  };
}

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

  const input = useVrInputRouter({
    workspace,
    onSetOverviewMode: workspace.setOverviewMode,
    onSendCommand: async (serverId, session, command) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.send(target, connection.terminalApiBasePath, session, command, true);
    },
    onSendControlChar: async (serverId, session, char) => {
      const { connection, target } = resolveServerTarget(serverId);
      await liveClient.ctrl(target, connection.terminalApiBasePath, session, char);
    },
  });

  return {
    workspace,
    input,
    hudStatus: input.hudStatus,
    clearHudStatus: input.clearHudStatus,
    dispatchVoice: input.dispatchVoice,
    dispatchGesture: input.dispatchGesture,
  };
}

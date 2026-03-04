import { useMemo } from "react";

import { ServerConnection } from "../types";

type ConnectionPoolLike = {
  connections: Map<string, ServerConnection>;
};

export function useServerConnection(pool: ConnectionPoolLike, serverId: string | null): ServerConnection | null {
  return useMemo(() => {
    if (!serverId) {
      return null;
    }
    return pool.connections.get(serverId) ?? null;
  }, [pool.connections, serverId]);
}

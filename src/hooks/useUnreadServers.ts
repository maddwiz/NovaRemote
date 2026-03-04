import { useEffect, useRef, useState } from "react";

import { ServerConnection } from "../types";

type UseUnreadServersArgs = {
  connections: Map<string, ServerConnection>;
  focusedServerId: string | null;
};

function snapshotTailLengths(connection: ServerConnection): Map<string, number> {
  const lengths = new Map<string, number>();
  Object.entries(connection.tails).forEach(([session, output]) => {
    lengths.set(session, output.length);
  });
  return lengths;
}

export function useUnreadServers({ connections, focusedServerId }: UseUnreadServersArgs): Set<string> {
  const [unreadServers, setUnreadServers] = useState<Set<string>>(new Set());
  const lastSeenTailLengthsRef = useRef<Map<string, Map<string, number>>>(new Map());

  useEffect(() => {
    if (!focusedServerId) {
      return;
    }
    const focusedConnection = connections.get(focusedServerId);
    if (!focusedConnection) {
      return;
    }

    lastSeenTailLengthsRef.current.set(focusedServerId, snapshotTailLengths(focusedConnection));
    setUnreadServers((prev) => {
      if (!prev.has(focusedServerId)) {
        return prev;
      }
      const next = new Set(prev);
      next.delete(focusedServerId);
      return next;
    });
  }, [connections, focusedServerId]);

  useEffect(() => {
    const nextUnread = new Set<string>();
    const availableServerIds = new Set<string>();

    connections.forEach((connection, serverId) => {
      availableServerIds.add(serverId);
      if (serverId === focusedServerId) {
        return;
      }

      const recorded = lastSeenTailLengthsRef.current.get(serverId);
      if (!recorded) {
        lastSeenTailLengthsRef.current.set(serverId, snapshotTailLengths(connection));
        return;
      }

      const hasUnread = Object.entries(connection.tails).some(([session, output]) => {
        const previousLength = recorded.get(session) ?? 0;
        return output.length > previousLength;
      });

      if (hasUnread) {
        nextUnread.add(serverId);
      }
    });

    Array.from(lastSeenTailLengthsRef.current.keys()).forEach((serverId) => {
      if (!availableServerIds.has(serverId)) {
        lastSeenTailLengthsRef.current.delete(serverId);
      }
    });

    setUnreadServers(nextUnread);
  }, [connections, focusedServerId]);

  return unreadServers;
}

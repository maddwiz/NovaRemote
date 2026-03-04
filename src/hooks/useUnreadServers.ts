import { useEffect, useRef, useState } from "react";

import { ServerConnection } from "../types";

type UseUnreadServersArgs = {
  connections: Map<string, ServerConnection>;
  focusedServerId: string | null;
};

const TAIL_SIGNATURE_SUFFIX_LENGTH = 160;

function tailSignature(output: string): string {
  const suffix = output.slice(-TAIL_SIGNATURE_SUFFIX_LENGTH);
  return `${output.length}:${suffix}`;
}

function snapshotTailSignatures(connection: ServerConnection): Map<string, string> {
  const signatures = new Map<string, string>();
  Object.entries(connection.tails).forEach(([session, output]) => {
    signatures.set(session, tailSignature(output));
  });
  return signatures;
}

export function useUnreadServers({ connections, focusedServerId }: UseUnreadServersArgs): Set<string> {
  const [unreadServers, setUnreadServers] = useState<Set<string>>(new Set());
  const lastSeenTailSignaturesRef = useRef<Map<string, Map<string, string>>>(new Map());

  useEffect(() => {
    if (!focusedServerId) {
      return;
    }
    const focusedConnection = connections.get(focusedServerId);
    if (!focusedConnection) {
      return;
    }

    lastSeenTailSignaturesRef.current.set(focusedServerId, snapshotTailSignatures(focusedConnection));
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

      const recorded = lastSeenTailSignaturesRef.current.get(serverId);
      if (!recorded) {
        lastSeenTailSignaturesRef.current.set(serverId, snapshotTailSignatures(connection));
        return;
      }

      const hasUnread = Object.entries(connection.tails).some(([session, output]) => {
        const previousSignature = recorded.get(session);
        const currentSignature = tailSignature(output);
        if (!previousSignature) {
          return output.length > 0;
        }
        return currentSignature !== previousSignature;
      });

      if (hasUnread) {
        nextUnread.add(serverId);
      }
    });

    Array.from(lastSeenTailSignaturesRef.current.keys()).forEach((serverId) => {
      if (!availableServerIds.has(serverId)) {
        lastSeenTailSignaturesRef.current.delete(serverId);
      }
    });

    setUnreadServers(nextUnread);
  }, [connections, focusedServerId]);

  return unreadServers;
}

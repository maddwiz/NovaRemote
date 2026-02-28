import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest } from "../api/client";
import { COLLAB_POLL_INTERVAL_MS, STORAGE_SESSION_COLLAB_READONLY_PREFIX } from "../constants";
import { ServerProfile, SessionCollaborator } from "../types";

type UseCollaborationArgs = {
  activeServer: ServerProfile | null;
  activeServerId: string | null;
  connected: boolean;
  enabled: boolean;
  terminalApiBasePath: "/tmux" | "/terminal";
  remoteOpenSessions: string[];
  focusedSession: string | null;
  allSessions: string[];
  isLocalSession: (session: string) => boolean;
};

function toOptionalBool(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value !== 0;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "1", "yes", "on", "readonly", "read_only"].includes(normalized)) {
      return true;
    }
    if (["false", "0", "no", "off", "interactive", "readwrite", "read_write"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function parsePresenceTimestamp(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? value : value * 1000;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCollaboratorRole(value: unknown): SessionCollaborator["role"] {
  if (typeof value !== "string") {
    return "unknown";
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "owner" || normalized === "editor" || normalized === "viewer") {
    return normalized;
  }
  return "unknown";
}

function normalizeSessionPresence(payload: unknown): { collaborators: SessionCollaborator[]; readOnly: boolean | null } {
  const root = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : null;
  const rawList = Array.isArray(payload)
    ? payload
    : Array.isArray(root?.collaborators)
      ? root?.collaborators
      : Array.isArray(root?.viewers)
        ? root?.viewers
        : Array.isArray(root?.participants)
          ? root?.participants
          : Array.isArray(root?.users)
            ? root?.users
            : [];

  const collaborators = rawList
    .map((entry, index) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const idValue = raw.id ?? raw.user_id ?? raw.uid ?? raw.socket_id;
      const id = typeof idValue === "string" && idValue.trim() ? idValue.trim() : `viewer-${index + 1}`;
      const nameValue = raw.name ?? raw.username ?? raw.display_name ?? raw.handle;
      const name = typeof nameValue === "string" && nameValue.trim() ? nameValue.trim() : id;
      const readOnly = toOptionalBool(raw.read_only ?? raw.readonly ?? raw.readOnly) ?? false;
      const isSelf = toOptionalBool(raw.is_self ?? raw.self ?? raw.me) ?? false;
      return {
        id,
        name,
        role: normalizeCollaboratorRole(raw.role),
        readOnly,
        isSelf,
        lastSeenAt: parsePresenceTimestamp(raw.last_seen_at ?? raw.lastSeenAt ?? raw.last_seen ?? raw.updated_at ?? raw.updatedAt),
      } satisfies SessionCollaborator;
    })
    .filter((entry): entry is SessionCollaborator => Boolean(entry))
    .sort((a, b) => a.name.localeCompare(b.name));

  const readOnly = toOptionalBool(root?.read_only ?? root?.readonly ?? root?.readOnly ?? root?.mode);
  return { collaborators, readOnly };
}

export function useCollaboration({
  activeServer,
  activeServerId,
  connected,
  enabled,
  terminalApiBasePath,
  remoteOpenSessions,
  focusedSession,
  allSessions,
  isLocalSession,
}: UseCollaborationArgs) {
  const [sessionPresence, setSessionPresence] = useState<Record<string, SessionCollaborator[]>>({});
  const [sessionReadOnly, setSessionReadOnly] = useState<Record<string, boolean>>({});
  const presenceInFlightRef = useRef<Set<string>>(new Set());

  const refreshSessionPresence = useCallback(
    async (session: string, showErrors: boolean = false) => {
      if (isLocalSession(session)) {
        setSessionPresence((prev) => ({ ...prev, [session]: [] }));
        return;
      }
      if (!activeServer || !connected || !enabled) {
        return;
      }
      if (presenceInFlightRef.current.has(session)) {
        return;
      }
      presenceInFlightRef.current.add(session);
      try {
        const candidates = [
          `${terminalApiBasePath}/presence?session=${encodeURIComponent(session)}`,
          `/collab/presence?session=${encodeURIComponent(session)}`,
          `/presence?session=${encodeURIComponent(session)}`,
        ];
        let payload: unknown = null;
        let lastError: unknown = null;
        for (const path of candidates) {
          try {
            payload = await apiRequest<unknown>(activeServer.baseUrl, activeServer.token, path);
            break;
          } catch (error) {
            lastError = error;
            const message = error instanceof Error ? error.message : String(error);
            if (message.startsWith("404") || message.startsWith("405") || message.startsWith("501")) {
              continue;
            }
          }
        }
        if (payload === null) {
          if (showErrors && lastError) {
            throw lastError;
          }
          setSessionPresence((prev) => ({ ...prev, [session]: [] }));
          return;
        }
        const normalized = normalizeSessionPresence(payload);
        setSessionPresence((prev) => ({ ...prev, [session]: normalized.collaborators }));
        if (normalized.readOnly !== null) {
          setSessionReadOnly((prev) => {
            const next = { ...prev };
            if (normalized.readOnly) {
              next[session] = true;
            } else {
              delete next[session];
            }
            return next;
          });
        }
      } finally {
        presenceInFlightRef.current.delete(session);
      }
    },
    [activeServer, connected, enabled, isLocalSession, terminalApiBasePath]
  );

  const setSessionReadOnlyValue = useCallback((session: string, value: boolean) => {
    setSessionReadOnly((prev) => {
      const next = { ...prev };
      if (value) {
        next[session] = true;
      } else {
        delete next[session];
      }
      return next;
    });
  }, []);

  useEffect(() => {
    setSessionPresence((prev) => {
      const next: Record<string, SessionCollaborator[]> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
    setSessionReadOnly((prev) => {
      const next: Record<string, boolean> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = true;
        }
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    let mounted = true;
    async function loadCollabReadOnly() {
      if (!activeServerId) {
        if (mounted) {
          setSessionReadOnly({});
        }
        return;
      }
      const raw = await SecureStore.getItemAsync(`${STORAGE_SESSION_COLLAB_READONLY_PREFIX}.${activeServerId}`);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setSessionReadOnly({});
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        if (!parsed || typeof parsed !== "object") {
          setSessionReadOnly({});
          return;
        }
        const next: Record<string, boolean> = {};
        Object.entries(parsed).forEach(([session, value]) => {
          const bool = toOptionalBool(value);
          if (bool !== null) {
            next[session] = bool;
          }
        });
        setSessionReadOnly(next);
      } catch {
        setSessionReadOnly({});
      }
    }
    void loadCollabReadOnly();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_SESSION_COLLAB_READONLY_PREFIX}.${activeServerId}`, JSON.stringify(sessionReadOnly));
  }, [activeServerId, sessionReadOnly]);

  useEffect(() => {
    if (!connected || !enabled || remoteOpenSessions.length === 0) {
      return;
    }
    const targetSession = focusedSession && remoteOpenSessions.includes(focusedSession) ? focusedSession : remoteOpenSessions[0];
    if (!targetSession) {
      return;
    }
    void refreshSessionPresence(targetSession, false);
    const id = setInterval(() => {
      void refreshSessionPresence(targetSession, false);
    }, COLLAB_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [connected, enabled, focusedSession, refreshSessionPresence, remoteOpenSessions]);

  useEffect(() => {
    if (connected && enabled) {
      return;
    }
    setSessionPresence({});
  }, [connected, enabled]);

  return {
    sessionPresence,
    sessionReadOnly,
    refreshSessionPresence,
    setSessionReadOnlyValue,
  };
}


import { useEffect, useMemo, useRef, useState } from "react";

type JoinedVoiceChannelSnapshot = {
  channelId: string;
  workspaceId: string;
  activeParticipantIds: string[];
  activeSpeakerId: string | null;
  muted: boolean;
};

type RemotePresencePayload = {
  channelId: string;
  participantIds: string[];
  activeSpeakerId: string | null;
};

export type VoiceBackplaneStatus = "disabled" | "connecting" | "connected" | "error";

type VoiceBackplaneSocket = {
  readyState: number;
  onopen: ((event: unknown) => void) | null;
  onmessage: ((event: { data?: unknown }) => void) | null;
  onerror: ((event: unknown) => void) | null;
  onclose: ((event: unknown) => void) | null;
  send: (data: string) => void;
  close: () => void;
};

type UseVoicePresenceBackplaneArgs = {
  enabled: boolean;
  endpoint: string | null;
  token?: string | null;
  participantId: string;
  joinedChannels: JoinedVoiceChannelSnapshot[];
  onRemotePresence: (payload: RemotePresencePayload) => void;
  socketFactory?: (endpoint: string) => VoiceBackplaneSocket;
};

export type UseVoicePresenceBackplaneResult = {
  status: VoiceBackplaneStatus;
  lastError: string | null;
  connectedAt: string | null;
};

const SOCKET_OPEN = 1;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;
const HEARTBEAT_INTERVAL_MS = 15_000;

function normalizeParticipantId(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function parseRemotePresenceEntries(payload: unknown): RemotePresencePayload[] {
  if (!payload || typeof payload !== "object") {
    return [];
  }
  const root = payload as Record<string, unknown>;
  const type = typeof root.type === "string" ? root.type.trim().toLowerCase() : "";
  const channels = Array.isArray(root.channels) ? root.channels : [];

  if (type === "presence_batch") {
    return channels.flatMap((entry) => parseRemotePresenceEntries({ type: "presence_sync", ...((entry as Record<string, unknown>) || {}) }));
  }

  if (type !== "presence_sync" && type !== "presence_snapshot" && type !== "presence") {
    return [];
  }

  const channelId = typeof root.channelId === "string" ? root.channelId.trim() : "";
  if (!channelId) {
    return [];
  }
  const rawParticipants = Array.isArray(root.participantIds)
    ? root.participantIds
    : Array.isArray(root.participants)
      ? root.participants
      : [];
  const participantIds = Array.from(new Set(rawParticipants.map((entry) => normalizeParticipantId(entry)).filter(Boolean)));
  const activeSpeakerId = normalizeParticipantId(root.activeSpeakerId);
  return [
    {
      channelId,
      participantIds,
      activeSpeakerId: activeSpeakerId || null,
    },
  ];
}

function makeSyncPayload(participantId: string, joinedChannels: JoinedVoiceChannelSnapshot[]) {
  return {
    type: "sync",
    participantId,
    channels: joinedChannels.map((channel) => ({
      channelId: channel.channelId,
      workspaceId: channel.workspaceId,
      muted: channel.muted,
      activeParticipantIds: channel.activeParticipantIds,
      activeSpeakerId: channel.activeSpeakerId,
    })),
  };
}

function computeReconnectDelayMs(attempt: number): number {
  if (attempt <= 0) {
    return RECONNECT_BASE_MS;
  }
  const next = RECONNECT_BASE_MS * 2 ** Math.min(8, attempt);
  return Math.min(RECONNECT_MAX_MS, next);
}

function createSocket(endpoint: string): VoiceBackplaneSocket | null {
  const Ctor = globalThis.WebSocket as unknown as (new (url: string) => VoiceBackplaneSocket) | undefined;
  if (!Ctor) {
    return null;
  }
  return new Ctor(endpoint);
}

export function useVoicePresenceBackplane({
  enabled,
  endpoint,
  token,
  participantId,
  joinedChannels,
  onRemotePresence,
  socketFactory,
}: UseVoicePresenceBackplaneArgs): UseVoicePresenceBackplaneResult {
  const [status, setStatus] = useState<VoiceBackplaneStatus>("disabled");
  const [lastError, setLastError] = useState<string | null>(null);
  const [connectedAt, setConnectedAt] = useState<string | null>(null);

  const socketRef = useRef<VoiceBackplaneSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const reconnectAttemptRef = useRef(0);
  const lastSyncSignatureRef = useRef("");
  const joinedChannelsRef = useRef<JoinedVoiceChannelSnapshot[]>([]);

  const normalizedEndpoint = endpoint?.trim() || "";
  const normalizedParticipantId = participantId.trim().toLowerCase();
  const joinedChannelSnapshot = useMemo(
    () =>
      joinedChannels.map((channel) => ({
        channelId: channel.channelId,
        workspaceId: channel.workspaceId,
        activeParticipantIds: Array.from(new Set(channel.activeParticipantIds.map((entry) => normalizeParticipantId(entry)).filter(Boolean))),
        activeSpeakerId: normalizeParticipantId(channel.activeSpeakerId) || null,
        muted: Boolean(channel.muted),
      })),
    [joinedChannels]
  );
  const shouldConnect = enabled && Boolean(normalizedEndpoint) && Boolean(normalizedParticipantId);

  useEffect(() => {
    joinedChannelsRef.current = joinedChannelSnapshot;
  }, [joinedChannelSnapshot]);

  useEffect(() => {
    if (!shouldConnect) {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
      reconnectAttemptRef.current = 0;
      setStatus("disabled");
      setLastError(null);
      setConnectedAt(null);
      return;
    }

    let disposed = false;

    const teardown = () => {
      if (heartbeatTimerRef.current) {
        clearInterval(heartbeatTimerRef.current);
        heartbeatTimerRef.current = null;
      }
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      socketRef.current?.close();
      socketRef.current = null;
    };

    const queueReconnect = () => {
      if (disposed || reconnectTimerRef.current) {
        return;
      }
      const delayMs = computeReconnectDelayMs(reconnectAttemptRef.current);
      reconnectAttemptRef.current += 1;
      reconnectTimerRef.current = setTimeout(() => {
        reconnectTimerRef.current = null;
        connect();
      }, delayMs);
    };

    const safeSend = (payload: Record<string, unknown>) => {
      const socket = socketRef.current;
      if (!socket || socket.readyState !== SOCKET_OPEN) {
        return;
      }
      try {
        socket.send(JSON.stringify(payload));
      } catch (error) {
        setLastError(error instanceof Error ? error.message : "Backplane send failed");
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }
      setStatus("connecting");
      setLastError(null);

      const socket = socketFactory ? socketFactory(normalizedEndpoint) : createSocket(normalizedEndpoint);
      if (!socket) {
        setStatus("error");
        setLastError("WebSocket transport unavailable");
        return;
      }
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("connected");
        setLastError(null);
        setConnectedAt(new Date().toISOString());
        safeSend({
          type: "auth",
          token: token?.trim() || null,
          participantId: normalizedParticipantId,
        });
        safeSend(makeSyncPayload(normalizedParticipantId, joinedChannelsRef.current));
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
        }
        heartbeatTimerRef.current = setInterval(() => {
          safeSend({ type: "ping", participantId: normalizedParticipantId });
        }, HEARTBEAT_INTERVAL_MS);
      };

      socket.onmessage = (event) => {
        const rawData = event?.data;
        const data = typeof rawData === "string" ? rawData : "";
        if (!data) {
          return;
        }
        try {
          const parsed = JSON.parse(data) as unknown;
          const entries = parseRemotePresenceEntries(parsed);
          entries.forEach((entry) => onRemotePresence(entry));
        } catch {
          setLastError("Backplane message parse failure");
        }
      };

      socket.onerror = () => {
        setStatus("error");
        setLastError("Backplane connection error");
      };

      socket.onclose = () => {
        if (disposed) {
          return;
        }
        if (heartbeatTimerRef.current) {
          clearInterval(heartbeatTimerRef.current);
          heartbeatTimerRef.current = null;
        }
        setStatus("connecting");
        queueReconnect();
      };
    };

    connect();

    return () => {
      disposed = true;
      teardown();
      reconnectAttemptRef.current = 0;
      setStatus("disabled");
    };
  }, [normalizedEndpoint, normalizedParticipantId, onRemotePresence, shouldConnect, socketFactory, token]);

  useEffect(() => {
    if (status !== "connected") {
      return;
    }
    const payload = makeSyncPayload(normalizedParticipantId, joinedChannelSnapshot);
    const signature = JSON.stringify(payload);
    if (signature === lastSyncSignatureRef.current) {
      return;
    }
    lastSyncSignatureRef.current = signature;
    const socket = socketRef.current;
    if (!socket || socket.readyState !== SOCKET_OPEN) {
      return;
    }
    try {
      socket.send(signature);
    } catch (error) {
      setLastError(error instanceof Error ? error.message : "Backplane sync send failed");
    }
  }, [joinedChannelSnapshot, normalizedParticipantId, status]);

  return useMemo(
    () => ({
      status,
      lastError,
      connectedAt,
    }),
    [connectedAt, lastError, status]
  );
}

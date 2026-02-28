import { useCallback, useEffect, useRef, useState } from "react";

import { apiRequest, websocketUrl } from "../api/client";
import { STREAM_RETRY_BASE_MS, STREAM_RETRY_FACTOR, STREAM_RETRY_MAX_MS } from "../constants";
import { ServerProfile, SessionConnectionMeta, TmuxStreamMessage, TmuxTailResponse } from "../types";

type UseWebSocketArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
  terminalApiBasePath: "/tmux" | "/terminal";
  openSessions: string[];
  setTails: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  onError: (error: unknown) => void;
  onSessionClosed?: (session: string) => void;
  onStreamError?: (session: string, message: string) => void;
};

type ReactNativeWebSocketCtor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> }
) => WebSocket;

const ReactNativeWebSocket = WebSocket as unknown as ReactNativeWebSocketCtor;

export function useWebSocket({
  activeServer,
  connected,
  terminalApiBasePath,
  openSessions,
  setTails,
  onError,
  onSessionClosed,
  onStreamError,
}: UseWebSocketArgs) {
  const [streamLive, setStreamLive] = useState<Record<string, boolean>>({});
  const [connectionMeta, setConnectionMeta] = useState<Record<string, SessionConnectionMeta>>({});

  const pollInFlight = useRef<Set<string>>(new Set());
  const streamRefs = useRef<Record<string, WebSocket | null>>({});
  const streamRetryRefs = useRef<Record<string, ReturnType<typeof setTimeout> | null>>({});
  const streamRetryCount = useRef<Record<string, number>>({});
  const openSessionsRef = useRef<string[]>([]);
  const connectedRef = useRef<boolean>(false);

  useEffect(() => {
    openSessionsRef.current = openSessions;
  }, [openSessions]);

  useEffect(() => {
    connectedRef.current = connected;
  }, [connected]);

  const closeStream = useCallback((session: string) => {
    const retry = streamRetryRefs.current[session];
    if (retry) {
      clearTimeout(retry);
      streamRetryRefs.current[session] = null;
    }

    delete streamRetryCount.current[session];

    const ws = streamRefs.current[session];
    if (ws) {
      ws.onopen = null;
      ws.onmessage = null;
      ws.onclose = null;
      ws.onerror = null;
      try {
        ws.close();
      } catch {
        // Ignore close failures.
      }
      streamRefs.current[session] = null;
    }

    setStreamLive((prev) => {
      if (!(session in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[session];
      return next;
    });
    setConnectionMeta((prev) => ({
      ...prev,
      [session]: {
        state: connectedRef.current ? "disconnected" : "disconnected",
        retryCount: 0,
        lastMessageAt: prev[session]?.lastMessageAt ?? null,
      },
    }));
  }, []);

  const closeAllStreams = useCallback(() => {
    Object.keys(streamRefs.current).forEach(closeStream);
  }, [closeStream]);

  const closeStreamsNotIn = useCallback(
    (sessions: string[]) => {
      Object.keys(streamRefs.current).forEach((session) => {
        if (!sessions.includes(session)) {
          closeStream(session);
        }
      });
    },
    [closeStream]
  );

  const fetchTail = useCallback(
    async (session: string, showErrors: boolean) => {
      if (!activeServer || !connected || pollInFlight.current.has(session)) {
        return;
      }

      pollInFlight.current.add(session);
      try {
        const data = await apiRequest<TmuxTailResponse>(
          activeServer.baseUrl,
          activeServer.token,
          `${terminalApiBasePath}/tail?session=${encodeURIComponent(session)}&lines=600`
        );
        const output = data.output ?? "";
        setTails((prev) => (prev[session] === output ? prev : { ...prev, [session]: output }));
      } catch (error) {
        if (showErrors) {
          onError(error);
        }
      } finally {
        pollInFlight.current.delete(session);
      }
    },
    [activeServer, connected, onError, setTails, terminalApiBasePath]
  );

  const connectStream = useCallback(
    (session: string) => {
      if (!activeServer || !connected) {
        return;
      }

      const existing = streamRefs.current[session];
      if (existing && (existing.readyState === WebSocket.CONNECTING || existing.readyState === WebSocket.OPEN)) {
        return;
      }

      const retry = streamRetryRefs.current[session];
      if (retry) {
        clearTimeout(retry);
        streamRetryRefs.current[session] = null;
      }

      const ws = new ReactNativeWebSocket(
        websocketUrl(activeServer.baseUrl, session, `${terminalApiBasePath}/stream`),
        undefined,
        {
        headers: {
          Authorization: `Bearer ${activeServer.token}`,
        },
      });
      streamRefs.current[session] = ws;
      setConnectionMeta((prev) => ({
        ...prev,
        [session]: {
          state: prev[session]?.retryCount ? "reconnecting" : "connecting",
          retryCount: prev[session]?.retryCount ?? 0,
          lastMessageAt: prev[session]?.lastMessageAt ?? null,
        },
      }));

      ws.onopen = () => {
        streamRetryCount.current[session] = 0;
        try {
          ws.send(JSON.stringify({ type: "auth", token: activeServer.token }));
        } catch {
          try {
            ws.close();
          } catch {
            // Ignore close failures.
          }
          return;
        }
        setStreamLive((prev) => ({ ...prev, [session]: true }));
        setConnectionMeta((prev) => ({
          ...prev,
          [session]: {
            state: "connected",
            retryCount: 0,
            lastMessageAt: prev[session]?.lastMessageAt ?? Date.now(),
          },
        }));
      };

      ws.onmessage = (event) => {
        let message: TmuxStreamMessage | null = null;
        try {
          message = JSON.parse(String(event.data)) as TmuxStreamMessage;
        } catch {
          return;
        }

        if (!message || message.session !== session) {
          return;
        }

        setConnectionMeta((prev) => ({
          ...prev,
          [session]: {
            state: "connected",
            retryCount: prev[session]?.retryCount ?? 0,
            lastMessageAt: Date.now(),
          },
        }));

        if (message.type === "snapshot") {
          const output = message.data ?? "";
          setTails((prev) => (prev[session] === output ? prev : { ...prev, [session]: output }));
          return;
        }

        if (message.type === "delta") {
          const delta = message.data ?? "";
          setTails((prev) => {
            const nextOutput = `${prev[session] ?? ""}${delta}`;
            if (prev[session] === nextOutput) {
              return prev;
            }
            return { ...prev, [session]: nextOutput };
          });
          return;
        }

        if (message.type === "session_closed") {
          closeStream(session);
          onSessionClosed?.(session);
          return;
        }

        if (message.type === "error" && message.data) {
          onError(new Error(message.data));
          onStreamError?.(session, message.data);
        }
      };

      ws.onclose = () => {
        setStreamLive((prev) => ({ ...prev, [session]: false }));
        streamRefs.current[session] = null;

        if (!connectedRef.current || !openSessionsRef.current.includes(session)) {
          setConnectionMeta((prev) => ({
            ...prev,
            [session]: {
              state: "disconnected",
              retryCount: 0,
              lastMessageAt: prev[session]?.lastMessageAt ?? null,
            },
          }));
          return;
        }

        const count = (streamRetryCount.current[session] || 0) + 1;
        streamRetryCount.current[session] = count;
        const delay = Math.min(
          STREAM_RETRY_BASE_MS * Math.pow(STREAM_RETRY_FACTOR, count - 1),
          STREAM_RETRY_MAX_MS
        );
        setConnectionMeta((prev) => ({
          ...prev,
          [session]: {
            state: "reconnecting",
            retryCount: count,
            lastMessageAt: prev[session]?.lastMessageAt ?? null,
          },
        }));

        streamRetryRefs.current[session] = setTimeout(() => {
          streamRetryRefs.current[session] = null;
          connectStream(session);
        }, delay);
      };

      ws.onerror = () => {
        // Let onclose trigger retries.
      };
    },
    [activeServer, closeStream, connected, onError, setTails, terminalApiBasePath]
  );

  return {
    streamLive,
    connectionMeta,
    setStreamLive,
    fetchTail,
    connectStream,
    closeStream,
    closeAllStreams,
    closeStreamsNotIn,
  };
}

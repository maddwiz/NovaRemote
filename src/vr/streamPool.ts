import { websocketUrl } from "../api/client";
import { VrStreamMessage, VrTerminalApiBasePath } from "./contracts";

type WebSocketLike = {
  readyState: number;
  onopen: any;
  onclose: any;
  onerror: any;
  onmessage: any;
  send: (data: string) => void;
  close: () => void;
};

type WebSocketCtor = new (
  url: string,
  protocols?: string | string[],
  options?: { headers?: Record<string, string> }
) => WebSocketLike;

export type VrStreamServerTarget = {
  id: string;
  baseUrl: string;
  token: string;
};

export type VrStreamStatus = "connecting" | "connected" | "reconnecting" | "disconnected";

export type VrStreamCallbacks = {
  onSnapshot?: (output: string) => void;
  onDelta?: (delta: string) => void;
  onSessionClosed?: () => void;
  onError?: (message: string) => void;
  onStatus?: (status: VrStreamStatus, retryCount: number) => void;
};

export type OpenVrStreamArgs = {
  server: VrStreamServerTarget;
  basePath: VrTerminalApiBasePath;
  session: string;
  callbacks?: VrStreamCallbacks;
};

export type VrStreamPool = {
  openStream: (args: OpenVrStreamArgs) => string;
  closeStream: (serverId: string, session: string) => void;
  closeServer: (serverId: string) => void;
  closeAll: () => void;
  pause: () => void;
  resume: () => void;
  trackedStreamCount: () => number;
  activeStreamCount: () => number;
  isPaused: () => boolean;
};

type CreateVrStreamPoolArgs = {
  websocketCtor?: WebSocketCtor | null;
  retryBaseMs?: number;
  retryFactor?: number;
  maxRetryMs?: number;
};

type StreamEntry = {
  key: string;
  args: OpenVrStreamArgs;
  ws: WebSocketLike | null;
  retryCount: number;
  retryTimer: ReturnType<typeof setTimeout> | null;
  closedByUser: boolean;
};

const WS_CONNECTING = 0;
const WS_OPEN = 1;
const DEFAULT_RETRY_BASE_MS = 350;
const DEFAULT_RETRY_FACTOR = 1.8;
const DEFAULT_MAX_RETRY_MS = 12000;

function getWebSocketCtor(ctor: WebSocketCtor | null | undefined): WebSocketCtor | null {
  if (ctor) {
    return ctor;
  }
  if (typeof globalThis !== "undefined" && "WebSocket" in globalThis) {
    return globalThis.WebSocket as unknown as WebSocketCtor;
  }
  return null;
}

function streamKey(serverId: string, session: string): string {
  return `${serverId.trim()}::${session.trim()}`;
}

function isActiveSocket(ws: WebSocketLike | null): boolean {
  if (!ws) {
    return false;
  }
  return ws.readyState === WS_CONNECTING || ws.readyState === WS_OPEN;
}

function emitStatus(entry: StreamEntry, status: VrStreamStatus) {
  entry.args.callbacks?.onStatus?.(status, entry.retryCount);
}

function detachSocket(ws: WebSocketLike) {
  ws.onopen = null;
  ws.onmessage = null;
  ws.onclose = null;
  ws.onerror = null;
}

export function createVrStreamPool({
  websocketCtor,
  retryBaseMs = DEFAULT_RETRY_BASE_MS,
  retryFactor = DEFAULT_RETRY_FACTOR,
  maxRetryMs = DEFAULT_MAX_RETRY_MS,
}: CreateVrStreamPoolArgs = {}): VrStreamPool {
  const Ctor = getWebSocketCtor(websocketCtor);
  const entries = new Map<string, StreamEntry>();
  let paused = false;

  const clearRetryTimer = (entry: StreamEntry) => {
    if (!entry.retryTimer) {
      return;
    }
    clearTimeout(entry.retryTimer);
    entry.retryTimer = null;
  };

  const closeSocket = (entry: StreamEntry) => {
    if (!entry.ws) {
      return;
    }
    const ws = entry.ws;
    entry.ws = null;
    detachSocket(ws);
    try {
      ws.close();
    } catch {
      // Ignore close transport failures.
    }
  };

  const removeEntry = (entry: StreamEntry) => {
    clearRetryTimer(entry);
    closeSocket(entry);
    entries.delete(entry.key);
    emitStatus(entry, "disconnected");
  };

  const scheduleReconnect = (entry: StreamEntry) => {
    if (paused || entry.closedByUser || !entries.has(entry.key)) {
      emitStatus(entry, "disconnected");
      return;
    }
    const delay = Math.min(
      maxRetryMs,
      Math.round(retryBaseMs * Math.pow(retryFactor, Math.max(0, entry.retryCount)))
    );
    entry.retryCount += 1;
    emitStatus(entry, "reconnecting");
    clearRetryTimer(entry);
    entry.retryTimer = setTimeout(() => {
      entry.retryTimer = null;
      const latest = entries.get(entry.key);
      if (!latest || latest.closedByUser || paused) {
        return;
      }
      openSocket(latest);
    }, delay);
  };

  const openSocket = (entry: StreamEntry) => {
    if (paused || entry.closedByUser) {
      emitStatus(entry, "disconnected");
      return;
    }
    if (!Ctor) {
      entry.args.callbacks?.onError?.("WebSocket transport is unavailable.");
      emitStatus(entry, "disconnected");
      return;
    }
    if (isActiveSocket(entry.ws)) {
      return;
    }

    clearRetryTimer(entry);
    emitStatus(entry, entry.retryCount > 0 ? "reconnecting" : "connecting");

    const ws = new Ctor(
      websocketUrl(entry.args.server.baseUrl, entry.args.session, `${entry.args.basePath}/stream`),
      undefined,
      {
        headers: {
          Authorization: `Bearer ${entry.args.server.token}`,
        },
      }
    );
    entry.ws = ws;

    ws.onopen = () => {
      entry.retryCount = 0;
      try {
        ws.send(JSON.stringify({ type: "auth", token: entry.args.server.token }));
      } catch {
        entry.args.callbacks?.onError?.("VR stream auth failed.");
        try {
          ws.close();
        } catch {
          // Ignore close failures.
        }
        return;
      }
      emitStatus(entry, "connected");
    };

    ws.onmessage = (event: any) => {
      let message: VrStreamMessage | null = null;
      try {
        message = JSON.parse(String(event.data)) as VrStreamMessage;
      } catch {
        return;
      }
      if (!message || message.session !== entry.args.session) {
        return;
      }

      if (message.type === "snapshot") {
        entry.args.callbacks?.onSnapshot?.(message.data || "");
        return;
      }
      if (message.type === "delta") {
        entry.args.callbacks?.onDelta?.(message.data || "");
        return;
      }
      if (message.type === "session_closed") {
        entry.args.callbacks?.onSessionClosed?.();
        removeEntry(entry);
        return;
      }
      if (message.type === "error" && message.data) {
        entry.args.callbacks?.onError?.(message.data);
      }
    };

    ws.onerror = () => {
      entry.args.callbacks?.onError?.("VR stream transport error.");
    };

    ws.onclose = () => {
      const latest = entries.get(entry.key);
      if (!latest || latest !== entry) {
        return;
      }
      entry.ws = null;
      if (entry.closedByUser || paused) {
        emitStatus(entry, "disconnected");
        return;
      }
      scheduleReconnect(entry);
    };
  };

  const openStream = (args: OpenVrStreamArgs): string => {
    const key = streamKey(args.server.id, args.session);
    if (!key || !args.server.baseUrl.trim() || !args.server.token.trim() || !args.session.trim()) {
      return key;
    }

    const existing = entries.get(key);
    if (existing) {
      const previousUrl = websocketUrl(
        existing.args.server.baseUrl,
        existing.args.session,
        `${existing.args.basePath}/stream`
      );
      const nextUrl = websocketUrl(args.server.baseUrl, args.session, `${args.basePath}/stream`);
      const credentialsChanged =
        previousUrl !== nextUrl || existing.args.server.token.trim() !== args.server.token.trim();
      existing.args = args;
      existing.closedByUser = false;
      if (credentialsChanged) {
        clearRetryTimer(existing);
        closeSocket(existing);
      }
      if (!paused) {
        openSocket(existing);
      }
      return key;
    }

    const entry: StreamEntry = {
      key,
      args,
      ws: null,
      retryCount: 0,
      retryTimer: null,
      closedByUser: false,
    };
    entries.set(key, entry);
    if (!paused) {
      openSocket(entry);
    }
    return key;
  };

  const closeStream = (serverId: string, session: string) => {
    const key = streamKey(serverId, session);
    const entry = entries.get(key);
    if (!entry) {
      return;
    }
    entry.closedByUser = true;
    removeEntry(entry);
  };

  const closeServer = (serverId: string) => {
    Array.from(entries.values()).forEach((entry) => {
      if (entry.args.server.id === serverId) {
        closeStream(entry.args.server.id, entry.args.session);
      }
    });
  };

  const closeAll = () => {
    Array.from(entries.values()).forEach((entry) => {
      closeStream(entry.args.server.id, entry.args.session);
    });
  };

  const pause = () => {
    if (paused) {
      return;
    }
    paused = true;
    entries.forEach((entry) => {
      clearRetryTimer(entry);
      closeSocket(entry);
      emitStatus(entry, "disconnected");
    });
  };

  const resume = () => {
    if (!paused) {
      return;
    }
    paused = false;
    entries.forEach((entry) => {
      if (!entry.closedByUser) {
        openSocket(entry);
      }
    });
  };

  const trackedStreamCount = () => entries.size;
  const activeStreamCount = () =>
    Array.from(entries.values()).reduce((count, entry) => (isActiveSocket(entry.ws) ? count + 1 : count), 0);

  return {
    openStream,
    closeStream,
    closeServer,
    closeAll,
    pause,
    resume,
    trackedStreamCount,
    activeStreamCount,
    isPaused: () => paused,
  };
}

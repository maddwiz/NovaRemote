export type SessionMeta = {
  name: string;
  created_at?: string;
  attached?: boolean;
  windows?: number;
};

export type CodexStartResponse = {
  ok: boolean;
  session: string;
  tail?: string;
  open_on_mac?: {
    requested: boolean;
    opened: boolean;
    error: string | null;
  };
};

export type CodexMessageResponse = {
  ok: boolean;
  session: string;
  tail?: string;
};

export type ShellRunResponse = {
  ok: boolean;
  session: string;
  output?: string;
};

export type TmuxTailResponse = {
  session: string;
  output?: string;
};

export type TmuxStreamMessage = {
  type: "delta" | "snapshot" | "session_closed" | "error";
  session: string;
  data: string;
};

export type ServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  defaultCwd: string;
};

export type TerminalSendMode = "ai" | "shell";

export type RouteTab = "terminals" | "servers" | "snippets" | "files";

export type Status = {
  text: string;
  error: boolean;
};

export type ConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";

export type SessionConnectionMeta = {
  state: ConnectionState;
  retryCount: number;
  lastMessageAt: number | null;
};

export type Snippet = {
  id: string;
  name: string;
  command: string;
  serverId?: string;
  mode: TerminalSendMode;
};

export type HealthMetrics = {
  lastPingAt: number | null;
  latencyMs: number | null;
  activeStreams: number;
  openSessions: number;
};

export type RemoteFileEntry = {
  name: string;
  path: string;
  is_dir: boolean;
  size: number;
  mtime: number;
};

export type ServerCapabilities = {
  tmux: boolean;
  codex: boolean;
  files: boolean;
  shellRun: boolean;
  macAttach: boolean;
  stream: boolean;
};

export type FleetRunResult = {
  serverId: string;
  serverName: string;
  session: string | null;
  ok: boolean;
  output: string;
  error?: string;
};

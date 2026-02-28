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
  terminalBackend?: TerminalBackendKind;
};

export type TerminalBackendKind = "auto" | "tmux" | "screen" | "zellij" | "powershell" | "cmd" | "pty";

export type TerminalSendMode = "ai" | "shell";

export type RouteTab = "terminals" | "servers" | "snippets" | "files" | "llms";

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
  terminal: boolean;
  tmux: boolean;
  codex: boolean;
  files: boolean;
  shellRun: boolean;
  macAttach: boolean;
  stream: boolean;
  sysStats: boolean;
  processes: boolean;
};

export type TerminalApiKind = "tmux" | "terminal";

export type FleetRunResult = {
  serverId: string;
  serverName: string;
  session: string | null;
  ok: boolean;
  output: string;
  error?: string;
};

export type LlmProviderKind = "openai_compatible" | "anthropic" | "ollama";

export type AiEnginePreference = "auto" | "server" | "external";

export type WatchRule = {
  enabled: boolean;
  pattern: string;
  lastMatch?: string | null;
};

export type QueuedCommandStatus = "pending" | "sending" | "sent" | "failed";

export type QueuedCommand = {
  id?: string;
  command: string;
  mode: TerminalSendMode;
  queuedAt: string;
  status?: QueuedCommandStatus;
  lastError?: string | null;
  sentAt?: string | null;
};

export type RecordingChunk = {
  atMs: number;
  text: string;
};

export type SessionRecording = {
  session: string;
  active: boolean;
  startedAt: number;
  stoppedAt: number | null;
  chunks: RecordingChunk[];
};

export type SysStats = {
  cpu_percent?: number;
  mem_percent?: number;
  load_1m?: number;
  load_5m?: number;
  load_15m?: number;
  disk_percent?: number;
  uptime_seconds?: number;
  host?: string;
  platform?: string;
};

export type ProcessInfo = {
  pid: number;
  name: string;
  cpu_percent?: number;
  mem_percent?: number;
  uptime_seconds?: number;
  user?: string;
  command?: string;
};

export type ProcessSignal = "TERM" | "KILL" | "INT";

export type TerminalThemePresetId = "nova" | "solarized_dark" | "monokai" | "dracula" | "nord" | "one_dark";

export type TerminalFontFamily = "menlo" | "sf_mono" | "jetbrains_mono";

export type TerminalThemeSettings = {
  preset: TerminalThemePresetId;
  fontSize: number;
  fontFamily: TerminalFontFamily;
  backgroundOpacity: number;
};

export type LlmProfile = {
  id: string;
  name: string;
  kind: LlmProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
};

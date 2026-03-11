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

export type SpectateLinkResponse = {
  ok?: boolean;
  url?: string;
  viewer_url?: string;
  spectate_url?: string;
  web_url?: string;
  token?: string;
  viewer_token?: string;
  path?: string;
  expires_at?: string;
  expiresAt?: string;
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

export type SessionCollaborator = {
  id: string;
  name: string;
  role: "owner" | "editor" | "viewer" | "unknown";
  readOnly: boolean;
  isSelf: boolean;
  lastSeenAt: number | null;
};

export type TeamAuthProvider = "novaremote_cloud" | "saml" | "oidc" | "ldap_proxy";

export type TeamSsoProvider = "saml" | "oidc";

export type TeamRole = "admin" | "operator" | "viewer" | "billing";

export type TeamPermission =
  | "servers:read"
  | "servers:write"
  | "servers:delete"
  | "sessions:create"
  | "sessions:send"
  | "sessions:view"
  | "fleet:execute"
  | "settings:manage"
  | "team:invite"
  | "team:manage"
  | "audit:read";

export type TeamPermissionLevel = "admin" | "operator" | "viewer";

export type TeamIdentity = {
  provider: TeamAuthProvider;
  userId: string;
  email: string;
  displayName: string;
  avatarUrl?: string;
  teamId: string;
  teamName: string;
  role: TeamRole;
  permissions: TeamPermission[];
  accessToken: string;
  tokenExpiresAt: number;
  refreshToken: string;
};

export type TeamSsoProviderConfig = {
  provider: TeamSsoProvider;
  enabled: boolean;
  displayName?: string;
  issuerUrl?: string;
  authUrl?: string;
  tokenUrl?: string;
  clientId?: string;
  callbackUrl?: string;
  updatedAt?: string;
};

export type TeamMember = {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  serverIds?: string[];
  sessionsCreated?: number;
  commandsSent?: number;
  fleetExecutions?: number;
  lastActiveAt?: string;
};

export type TeamFleetApprovalStatus = "pending" | "approved" | "denied" | "expired";

export type TeamFleetApproval = {
  id: string;
  command: string;
  requestedByUserId: string;
  requestedByEmail: string;
  targets: string[];
  createdAt: string;
  updatedAt: string;
  status: TeamFleetApprovalStatus;
  note?: string;
  expiresAt?: string;
  reviewedByUserId?: string;
  reviewedByEmail?: string;
  reviewedAt?: string;
  executionClaimedByUserId?: string;
  executionClaimedByEmail?: string;
  executionClaimedAt?: string;
  executionToken?: string;
  executionCompletedByUserId?: string;
  executionCompletedByEmail?: string;
  executionCompletedAt?: string;
  executionResult?: "succeeded" | "failed";
  executionSummary?: string;
};

export type TeamInviteStatus = "pending" | "accepted" | "expired" | "revoked";

export type TeamInvite = {
  id: string;
  email: string;
  role: TeamRole;
  status: TeamInviteStatus;
  inviteCode?: string;
  inviteLink?: string;
  createdAt: string;
  expiresAt?: string;
  revokedAt?: string;
};

export type TeamAuditExportStatus = "pending" | "ready" | "failed";

export type TeamAuditExportJob = {
  exportId: string;
  format: "json" | "csv";
  status: TeamAuditExportStatus;
  createdAt: string;
  readyAt?: string;
  failedAt?: string;
  lastTransitionAt?: string;
  attemptCount?: number;
  requestedByUserId?: string;
  requestedByEmail?: string;
  rangeHours?: number;
  eventCount?: number;
  expiresAt?: string;
  downloadUrl?: string;
  detail?: string;
};

export type TokenBrokerPermission = "read" | "write" | "execute" | "admin";

export type TokenBrokerResult = {
  serverId: string;
  token: string;
  expiresAt: number;
  permissions: TokenBrokerPermission[];
};

export type ServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  defaultCwd: string;
  source?: "local" | "team";
  teamServerId?: string;
  permissionLevel?: TeamPermissionLevel;
  terminalBackend?: TerminalBackendKind;
  vmHost?: string;
  vmType?: VmType;
  vmName?: string;
  vmId?: string;
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  portainerUrl?: string;
  proxmoxUrl?: string;
  grafanaUrl?: string;
};

export type TerminalBackendKind = "auto" | "tmux" | "screen" | "zellij" | "powershell" | "cmd" | "pty";
export type VmType = "proxmox" | "vmware" | "hyper-v" | "docker" | "lxc" | "qemu" | "virtualbox" | "cloud";

export type TerminalSendMode = "ai" | "shell";

export type RouteTab =
  | "terminals"
  | "servers"
  | "agents"
  | "snippets"
  | "files"
  | "llms"
  | "team"
  | "glasses"
  | "vr"
  | "settings";

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

export type ConnectionPoolStatus = "disconnected" | "connecting" | "connected" | "degraded" | "error";

export type ServerConnection = {
  server: ServerProfile;
  connected: boolean;
  capabilities: ServerCapabilities;
  terminalApiBasePath: "/tmux" | "/terminal";
  capabilitiesLoading: boolean;
  allSessions: string[];
  localAiSessions: string[];
  openSessions: string[];
  tails: Record<string, string>;
  drafts: Record<string, string>;
  sendBusy: Record<string, boolean>;
  sendModes: Record<string, TerminalSendMode>;
  streamLive: Record<string, boolean>;
  connectionMeta: Record<string, SessionConnectionMeta>;
  health: HealthMetrics;
  status: ConnectionPoolStatus;
  lastError: string | null;
  activeStreamCount: number;
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
  collaboration: boolean;
  spectate: boolean;
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

export type NovaAgentStatus = "idle" | "monitoring" | "executing" | "waiting_approval";

export type NovaAgentPendingApproval = {
  requestedAt: string;
  summary: string;
  command?: string;
  session?: string;
};

export type NovaAgent = {
  serverId: string;
  agentId: string;
  name: string;
  status: NovaAgentStatus;
  currentGoal: string;
  memoryContextId: string;
  capabilities: string[];
  pendingApproval: NovaAgentPendingApproval | null;
  updatedAt: string;
  lastActionAt: string | null;
};

export type NovaMemoryKind =
  | "agent_created"
  | "goal_updated"
  | "approval_requested"
  | "approval_approved"
  | "approval_denied"
  | "command_dispatched"
  | "agent_removed"
  | "note";

export type NovaMemoryEntry = {
  id: string;
  serverId: string;
  memoryContextId: string;
  agentId: string | null;
  kind: NovaMemoryKind;
  summary: string;
  command?: string;
  session?: string;
  createdAt: string;
};

export type NovaSpineContextStatus = "waiting_approval" | "active" | "healthy" | "stale" | "idle";

export type NovaSpineContext = {
  serverId: string;
  memoryContextId: string;
  agentIds: string[];
  agentNames: string[];
  activeStatus: NovaAgentStatus | "mixed" | "none";
  status: NovaSpineContextStatus;
  pendingApprovalCount: number;
  lastUpdatedAt: string | null;
  lastSummary: string | null;
  totalEntries: number;
  recentEntries: NovaMemoryEntry[];
};

export type NovaAdaptBridgeHealth = {
  ok: boolean;
  [key: string]: unknown;
};

export type NovaAdaptBridgeMemoryStatus = {
  ok?: boolean;
  enabled?: boolean;
  backend?: string | null;
  [key: string]: unknown;
};

export type NovaAdaptBridgePlan = {
  id: string;
  objective: string;
  status: string;
  createdAt: string | null;
  updatedAt: string | null;
  progressCompleted: number;
  progressTotal: number;
  executionError: string | null;
  rejectReason: string | null;
};

export type NovaAdaptBridgeJob = {
  id: string;
  status: string;
  createdAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  error: string | null;
};

export type NovaAdaptBridgeWorkflow = {
  workflowId: string;
  status: string;
  objective: string;
  createdAt: string | null;
  updatedAt: string | null;
  lastError: string | null;
  context: Record<string, unknown>;
};

export type NovaAdaptBridgeGovernanceJobs = {
  active: number;
  queued: number;
  running: number;
  maxWorkers: number;
};

export type NovaAdaptBridgeGovernance = {
  paused: boolean;
  pauseReason: string | null;
  budgetLimitUsd: number | null;
  maxActiveRuns: number | null;
  activeRuns: number;
  runsTotal: number;
  llmCallsTotal: number;
  spendEstimateUsd: number;
  updatedAt: string | null;
  lastRunAt: string | null;
  lastObjectivePreview: string | null;
  lastStrategy: string | null;
  jobs: NovaAdaptBridgeGovernanceJobs;
};

export type LlmProviderKind = "openai_compatible" | "azure_openai" | "anthropic" | "ollama" | "gemini";

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

export type AuditAction =
  | "session_created"
  | "command_sent"
  | "command_dangerous_approved"
  | "command_dangerous_denied"
  | "fleet_executed"
  | "fleet_approval_requested"
  | "fleet_approval_approved"
  | "fleet_approval_denied"
  | "fleet_approval_consumed"
  | "fleet_execution_claimed"
  | "fleet_execution_completed"
  | "file_written"
  | "file_deleted"
  | "process_killed"
  | "server_added"
  | "server_removed"
  | "spectate_link_created"
  | "voice_command_sent"
  | "settings_changed";

export type AuditEvent = {
  id: string;
  timestamp: number;
  userId: string;
  userEmail: string;
  serverId: string;
  serverName: string;
  session: string;
  action: AuditAction;
  detail: string;
  approved: boolean | null;
  deviceId: string;
  appVersion: string;
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

export type GlassesBrand = "xreal_x1" | "halo" | "custom" | "meta_orion" | "meta_ray_ban" | "viture_pro";

export type GlassesModeSettings = {
  enabled: boolean;
  brand: GlassesBrand;
  textScale: number;
  voiceAutoSend: boolean;
  voiceLoop: boolean;
  wakePhraseEnabled: boolean;
  wakePhrase: string;
  minimalMode: boolean;
  vadEnabled: boolean;
  vadSilenceMs: number;
  vadSensitivityDb: number;
  loopCaptureMs: number;
  headsetPttEnabled: boolean;
};

export type LlmProfile = {
  id: string;
  name: string;
  kind: LlmProviderKind;
  baseUrl: string;
  apiKey: string;
  model: string;
  systemPrompt?: string;
  requestPath?: string;
  extraHeaders?: string;
  azureDeployment?: string;
  azureApiVersion?: string;
};

export type LlmToolExecution = {
  name: string;
  arguments: string;
  output: string;
  error?: string;
};

export type LlmToolDefinition = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  run: (args: Record<string, unknown>, context: Record<string, string>) => string;
};

export type LlmSendOptions = {
  imageUrl?: string;
  enableBuiltInTools?: boolean;
  customTools?: LlmToolDefinition[];
  toolContext?: Record<string, string>;
  maxToolRounds?: number;
  responseFormat?: "text" | "json";
  onTextDelta?: (delta: string, fullText: string) => void;
  signal?: AbortSignal;
};

export type LlmTimingMetrics = {
  streamed: boolean;
  totalMs: number;
  firstTokenMs: number | null;
};

export type LlmSendResult = {
  text: string;
  toolCalls: LlmToolExecution[];
  usedVision: boolean;
  usedTools: boolean;
  timings?: LlmTimingMetrics;
};

export type SharedServerTemplate = {
  id: string;
  name: string;
  baseUrl: string;
  defaultCwd: string;
  terminalBackend?: TerminalBackendKind;
  vmHost?: string;
  vmType?: VmType;
  vmName?: string;
  vmId?: string;
  sshHost?: string;
  sshUser?: string;
  sshPort?: number;
  portainerUrl?: string;
  proxmoxUrl?: string;
  grafanaUrl?: string;
  importedAt: string;
};

export type WorkspaceRole = "owner" | "editor" | "viewer";

export type WorkspaceMember = {
  id: string;
  name: string;
  role: WorkspaceRole;
};

export type SharedWorkspace = {
  id: string;
  name: string;
  serverIds: string[];
  members: WorkspaceMember[];
  channelId: string;
  createdAt: string;
  updatedAt: string;
};

export type VoiceChannel = {
  id: string;
  workspaceId: string;
  name: string;
  joined: boolean;
  muted: boolean;
  activeParticipantIds?: string[];
  activeSpeakerId?: string | null;
  lastSpokeAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

import { normalizeForMatch } from "./spatialVoiceRoutingCore";
import {
  AiEnginePreference,
  LlmToolDefinition,
  LlmToolExecution,
  NovaAgentStatus,
  ProcessSignal,
  RouteTab,
  TerminalSendMode,
} from "./types";

export type NovaAssistantRole = "user" | "assistant";

export type NovaAssistantMessage = {
  id: string;
  role: NovaAssistantRole;
  content: string;
  createdAt: string;
};

export type NovaAssistantSessionContext = {
  session: string;
  mode: TerminalSendMode;
  localAi: boolean;
  live: boolean;
};

export type NovaAssistantServerContext = {
  id: string;
  name: string;
  connected: boolean;
  vmHost?: string;
  vmType?: string;
  vmName?: string;
  vmId?: string;
  hasPortainerUrl?: boolean;
  hasProxmoxUrl?: boolean;
  hasGrafanaUrl?: boolean;
  hasSshFallback?: boolean;
  sessions: NovaAssistantSessionContext[];
};

export type NovaAssistantRuntimeContext = {
  route: RouteTab;
  focusedServerId: string | null;
  focusedServerName: string | null;
  focusedSession: string | null;
  activeProfileName: string | null;
  files: {
    currentPath: string;
    includeHidden: boolean;
    selectedFilePath: string | null;
    selectedContentPreview: string;
    entries: Array<{ name: string; path: string; isDir: boolean }>;
  };
  team: {
    loggedIn: boolean;
    teamName: string | null;
    role: string | null;
    cloudDashboardUrl: string | null;
    auditPendingCount: number;
  };
  processes: {
    available: boolean;
    busy: boolean;
    items: Array<{
      pid: number;
      name: string;
      cpuPercent?: number;
      memPercent?: number;
      command?: string;
    }>;
  };
  servers: NovaAssistantServerContext[];
  settings: {
    glassesEnabled: boolean;
    glassesVoiceAutoSend: boolean;
    glassesVoiceLoop: boolean;
    glassesWakePhraseEnabled: boolean;
    glassesMinimalMode: boolean;
    glassesTextScale: number;
    startAiEngine: AiEnginePreference;
    startKind: TerminalSendMode;
    poolPaused: boolean;
  };
};

export type NovaAssistantAction =
  | { type: "navigate"; route: RouteTab }
  | { type: "focus_server"; serverRef?: string }
  | { type: "focus_session"; serverRef?: string; sessionRef?: string }
  | { type: "create_session"; serverRef?: string; kind: "ai" | "shell"; prompt?: string }
  | {
      type: "send_command";
      serverRef?: string;
      sessionRef?: string;
      command: string;
      mode?: TerminalSendMode;
      createIfMissing?: boolean;
      createKind?: "ai" | "shell";
    }
  | { type: "set_draft"; serverRef?: string; sessionRef?: string; text: string }
  | { type: "stop_session"; serverRef?: string; sessionRef?: string }
  | { type: "list_files"; serverRef?: string; path?: string; includeHidden?: boolean }
  | { type: "open_file"; serverRef?: string; path?: string }
  | { type: "tail_file"; serverRef?: string; path?: string; lines?: number }
  | { type: "create_folder"; serverRef?: string; path: string }
  | { type: "save_file"; serverRef?: string; path: string; content: string }
  | { type: "refresh_processes"; serverRef?: string }
  | { type: "kill_process"; serverRef?: string; pid: number; signal?: ProcessSignal }
  | { type: "open_server_link"; serverRef?: string; target: "ssh" | "portainer" | "proxmox" | "grafana" }
  | { type: "create_agent"; serverRef?: string; name: string; goal?: string }
  | {
      type: "update_agent";
      serverRef?: string;
      name: string;
      status?: NovaAgentStatus;
      goal?: string;
      queuedCommand?: string;
    }
  | { type: "approve_agents"; serverRef?: string }
  | { type: "deny_agents"; serverRef?: string }
  | { type: "team_refresh" }
  | { type: "team_open_dashboard" }
  | { type: "team_sync_audit" }
  | { type: "team_request_audit_export"; format: "json" | "csv"; rangeHours?: number }
  | { type: "team_refresh_audit_exports" }
  | {
      type: "set_preference";
      key:
        | "glasses.enabled"
        | "glasses.voiceAutoSend"
        | "glasses.voiceLoop"
        | "glasses.wakePhraseEnabled"
        | "glasses.minimalMode"
        | "glasses.textScale"
        | "start.aiEngine"
        | "start.kind";
      value: boolean | number | string;
    }
  | { type: "set_pool_paused"; paused: boolean };

export type NovaAssistantPlan = {
  reply: string;
  actions: NovaAssistantAction[];
};

export type NovaAssistantExecutionResult = {
  action: NovaAssistantAction["type"];
  ok: boolean;
  detail: string;
};

export const NOVA_ASSISTANT_TOOL_NAME = "plan_nova_actions";

type NovaAssistantPreferenceKey = Extract<NovaAssistantAction, { type: "set_preference" }>["key"];

const ALLOWED_ROUTES: RouteTab[] = ["terminals", "servers", "snippets", "files", "llms", "team", "glasses", "vr"];
const ALLOWED_AGENT_STATUSES: NovaAgentStatus[] = ["idle", "monitoring", "executing", "waiting_approval"];
const ALLOWED_PREFERENCE_KEYS = new Set<NovaAssistantPreferenceKey>([
  "glasses.enabled",
  "glasses.voiceAutoSend",
  "glasses.voiceLoop",
  "glasses.wakePhraseEnabled",
  "glasses.minimalMode",
  "glasses.textScale",
  "start.aiEngine",
  "start.kind",
] as const);

function trimText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function coerceBoolean(value: unknown): boolean | null {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["true", "on", "yes", "enable", "enabled"].includes(normalized)) {
      return true;
    }
    if (["false", "off", "no", "disable", "disabled"].includes(normalized)) {
      return false;
    }
  }
  return null;
}

function coerceNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number.parseFloat(value.trim());
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function coerceRoute(value: unknown): RouteTab | null {
  const normalized = trimText(value).toLowerCase() as RouteTab;
  return ALLOWED_ROUTES.includes(normalized) ? normalized : null;
}

function coerceMode(value: unknown): TerminalSendMode | null {
  const normalized = trimText(value).toLowerCase();
  return normalized === "ai" || normalized === "shell" ? normalized : null;
}

function coerceAgentStatus(value: unknown): NovaAgentStatus | null {
  const normalized = trimText(value).toLowerCase() as NovaAgentStatus;
  return ALLOWED_AGENT_STATUSES.includes(normalized) ? normalized : null;
}

function coerceProcessSignal(value: unknown): ProcessSignal | null {
  const normalized = trimText(value).toUpperCase();
  return normalized === "TERM" || normalized === "KILL" || normalized === "INT" ? normalized : null;
}

function normalizeAction(input: unknown): NovaAssistantAction | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return null;
  }
  const raw = input as Record<string, unknown>;
  const type = trimText(raw.type).toLowerCase();

  if (type === "navigate") {
    const route = coerceRoute(raw.route);
    return route ? { type: "navigate", route } : null;
  }

  if (type === "focus_server") {
    return {
      type: "focus_server",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
    };
  }

  if (type === "focus_session") {
    return {
      type: "focus_session",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      sessionRef: trimText(raw.sessionRef || raw.session || raw.sessionName) || undefined,
    };
  }

  if (type === "create_session") {
    const kind = coerceMode(raw.kind || raw.sessionKind);
    if (kind !== "ai" && kind !== "shell") {
      return null;
    }
    return {
      type: "create_session",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      kind,
      prompt: trimText(raw.prompt) || undefined,
    };
  }

  if (type === "send_command") {
    const command = trimText(raw.command);
    if (!command) {
      return null;
    }
    const mode = coerceMode(raw.mode);
    const createKind = coerceMode(raw.createKind || raw.sessionKind);
    const createIfMissing = coerceBoolean(raw.createIfMissing);
    return {
      type: "send_command",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      sessionRef: trimText(raw.sessionRef || raw.session || raw.sessionName) || undefined,
      command,
      mode: mode || undefined,
      createIfMissing: createIfMissing === true,
      createKind: createKind === "ai" || createKind === "shell" ? createKind : undefined,
    };
  }

  if (type === "set_draft") {
    const text = trimText(raw.text || raw.draft);
    if (!text) {
      return null;
    }
    return {
      type: "set_draft",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      sessionRef: trimText(raw.sessionRef || raw.session || raw.sessionName) || undefined,
      text,
    };
  }

  if (type === "stop_session") {
    return {
      type: "stop_session",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      sessionRef: trimText(raw.sessionRef || raw.session || raw.sessionName) || undefined,
    };
  }

  if (type === "list_files") {
    const includeHidden = coerceBoolean(raw.includeHidden);
    return {
      type: "list_files",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      path: trimText(raw.path) || undefined,
      includeHidden: includeHidden === null ? undefined : includeHidden,
    };
  }

  if (type === "open_file") {
    return {
      type: "open_file",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      path: trimText(raw.path || raw.filePath) || undefined,
    };
  }

  if (type === "tail_file") {
    const lines = coerceNumber(raw.lines);
    return {
      type: "tail_file",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      path: trimText(raw.path || raw.filePath) || undefined,
      lines: lines === null ? undefined : Math.max(1, Math.round(lines)),
    };
  }

  if (type === "save_file") {
    const path = trimText(raw.path || raw.filePath);
    if (!path) {
      return null;
    }
    return {
      type: "save_file",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      path,
      content: typeof raw.content === "string" ? raw.content : "",
    };
  }

  if (type === "create_folder") {
    const path = trimText(raw.path || raw.folderPath || raw.directoryPath || raw.name);
    if (!path) {
      return null;
    }
    return {
      type: "create_folder",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      path,
    };
  }

  if (type === "refresh_processes") {
    return {
      type: "refresh_processes",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
    };
  }

  if (type === "kill_process") {
    const pid = coerceNumber(raw.pid);
    if (pid === null || pid <= 0) {
      return null;
    }
    return {
      type: "kill_process",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      pid: Math.round(pid),
      signal: coerceProcessSignal(raw.signal) || undefined,
    };
  }

  if (type === "open_server_link") {
    const target = trimText(raw.target || raw.link || raw.linkType).toLowerCase();
    if (target !== "ssh" && target !== "portainer" && target !== "proxmox" && target !== "grafana") {
      return null;
    }
    return {
      type: "open_server_link",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      target,
    };
  }

  if (type === "create_agent") {
    const name = trimText(raw.name || raw.agentName);
    if (!name) {
      return null;
    }
    return {
      type: "create_agent",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      name,
      goal: trimText(raw.goal) || undefined,
    };
  }

  if (type === "update_agent") {
    const name = trimText(raw.name || raw.agentName);
    if (!name) {
      return null;
    }
    const status = coerceAgentStatus(raw.status);
    const goal = trimText(raw.goal) || undefined;
    const queuedCommand = trimText(raw.queuedCommand || raw.command) || undefined;
    if (!status && !goal && !queuedCommand) {
      return null;
    }
    return {
      type: "update_agent",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
      name,
      status: status || undefined,
      goal,
      queuedCommand,
    };
  }

  if (type === "approve_agents") {
    return {
      type: "approve_agents",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
    };
  }

  if (type === "deny_agents") {
    return {
      type: "deny_agents",
      serverRef: trimText(raw.serverRef || raw.server || raw.serverName || raw.serverId) || undefined,
    };
  }

  if (type === "team_refresh") {
    return { type: "team_refresh" };
  }

  if (type === "team_open_dashboard") {
    return { type: "team_open_dashboard" };
  }

  if (type === "team_sync_audit") {
    return { type: "team_sync_audit" };
  }

  if (type === "team_request_audit_export") {
    const format = trimText(raw.format).toLowerCase();
    if (format !== "json" && format !== "csv") {
      return null;
    }
    const rangeHours = coerceNumber(raw.rangeHours);
    return {
      type: "team_request_audit_export",
      format,
      rangeHours: rangeHours === null ? undefined : Math.max(1, Math.round(rangeHours)),
    };
  }

  if (type === "team_refresh_audit_exports") {
    return { type: "team_refresh_audit_exports" };
  }

  if (type === "set_preference") {
    const key = trimText(raw.key) as NovaAssistantPreferenceKey;
    if (!ALLOWED_PREFERENCE_KEYS.has(key)) {
      return null;
    }
    let value = raw.value as boolean | number | string;
    if (key === "glasses.textScale") {
      const numeric = coerceNumber(raw.value);
      if (numeric === null) {
        return null;
      }
      value = numeric;
    }
    if (
      key === "glasses.enabled" ||
      key === "glasses.voiceAutoSend" ||
      key === "glasses.voiceLoop" ||
      key === "glasses.wakePhraseEnabled" ||
      key === "glasses.minimalMode"
    ) {
      const booleanValue = coerceBoolean(raw.value);
      if (booleanValue === null) {
        return null;
      }
      value = booleanValue;
    }
    if (key === "start.aiEngine") {
      const engine = trimText(raw.value).toLowerCase();
      if (engine !== "auto" && engine !== "server" && engine !== "external") {
        return null;
      }
      value = engine;
    }
    if (key === "start.kind") {
      const kind = coerceMode(raw.value);
      if (!kind) {
        return null;
      }
      value = kind;
    }
    return {
      type: "set_preference",
      key,
      value,
    };
  }

  if (type === "set_pool_paused") {
    const paused = coerceBoolean(raw.paused);
    return paused === null ? null : { type: "set_pool_paused", paused };
  }

  return null;
}

function extractJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const codeFenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]+?)\s*```/i);
  const candidate = codeFenceMatch?.[1]?.trim() || trimmed;

  const direct = tryParseObject(candidate);
  if (direct) {
    return direct;
  }

  const firstBrace = candidate.indexOf("{");
  const lastBrace = candidate.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return tryParseObject(candidate.slice(firstBrace, lastBrace + 1));
  }
  return null;
}

function tryParseObject(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    return null;
  }
  return null;
}

function serializeHistory(messages: NovaAssistantMessage[]): string {
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "User" : "Nova"}: ${message.content.trim().slice(0, 1200)}`)
    .join("\n");
}

function serializeContext(context: NovaAssistantRuntimeContext): string {
  return JSON.stringify(
    {
      route: context.route,
      focusedServerId: context.focusedServerId,
      focusedServerName: context.focusedServerName,
      focusedSession: context.focusedSession,
      activeProfileName: context.activeProfileName,
      files: context.files,
      team: context.team,
      processes: context.processes,
      settings: context.settings,
      servers: context.servers.map((server) => ({
        id: server.id,
        name: server.name,
        connected: server.connected,
        vmHost: server.vmHost,
        vmType: server.vmType,
        vmName: server.vmName,
        vmId: server.vmId,
        hasPortainerUrl: server.hasPortainerUrl,
        hasProxmoxUrl: server.hasProxmoxUrl,
        hasGrafanaUrl: server.hasGrafanaUrl,
        hasSshFallback: server.hasSshFallback,
        sessions: server.sessions.slice(0, 8).map((session) => ({
          session: session.session,
          mode: session.mode,
          localAi: session.localAi,
          live: session.live,
        })),
      })),
    },
    null,
    2
  );
}

export function buildNovaAssistantPrompt(args: {
  history: NovaAssistantMessage[];
  context: NovaAssistantRuntimeContext;
  input: string;
}): string {
  return [
    "You are Nova, the conversational control layer for the NovaRemote app.",
    "Have a normal conversation with the user, but when an app action is appropriate, return structured actions.",
    "You must respond with exactly one JSON object and no markdown.",
    'Shape: {"reply":"natural language reply","actions":[...]}',
    "Rules:",
    "- The reply should read like a normal assistant response.",
    "- Use actions only when you are confident enough to act.",
    "- If information is missing or ambiguous, ask a clarifying question in reply and return an empty actions array.",
    "- Prefer using server IDs or exact server names from context.",
    '- You may use placeholders "$focused_server", "$focused_session", and "$last_session".',
    "- Do not invent servers, sessions, routes, or settings keys.",
    "- Dangerous shell commands may require confirmation in-app; still propose the action if the user explicitly asked for it.",
    "Allowed actions:",
    '- {"type":"navigate","route":"terminals|servers|files|snippets|llms|team|glasses|vr"}',
    '- {"type":"focus_server","serverRef":"name|id|$focused_server"}',
    '- {"type":"focus_session","serverRef":"...","sessionRef":"session|$focused_session|$last_session"}',
    '- {"type":"create_session","serverRef":"...","kind":"ai|shell","prompt":"optional"}',
    '- {"type":"send_command","serverRef":"...","sessionRef":"...","command":"...","mode":"ai|shell","createIfMissing":true,"createKind":"ai|shell"}',
    '- {"type":"set_draft","serverRef":"...","sessionRef":"...","text":"..."}',
    '- {"type":"stop_session","serverRef":"...","sessionRef":"..."}',
    '- {"type":"list_files","serverRef":"optional","path":"optional","includeHidden":true|false}',
    '- {"type":"open_file","serverRef":"optional","path":"optional"}',
    '- {"type":"tail_file","serverRef":"optional","path":"optional","lines":200}',
    '- {"type":"create_folder","serverRef":"optional","path":"/path/to/folder"}',
    '- {"type":"save_file","serverRef":"optional","path":"/path/to/file","content":"full file content"}',
    '- {"type":"refresh_processes","serverRef":"optional"}',
    '- {"type":"kill_process","serverRef":"optional","pid":1234,"signal":"TERM|KILL|INT"}',
    '- {"type":"open_server_link","serverRef":"optional","target":"ssh|portainer|proxmox|grafana"}',
    '- {"type":"create_agent","serverRef":"...","name":"...","goal":"optional"}',
    '- {"type":"update_agent","serverRef":"...","name":"...","status":"idle|monitoring|executing|waiting_approval","goal":"optional","queuedCommand":"optional"}',
    '- {"type":"approve_agents","serverRef":"..."}',
    '- {"type":"deny_agents","serverRef":"..."}',
    '- {"type":"team_refresh"}',
    '- {"type":"team_open_dashboard"}',
    '- {"type":"team_sync_audit"}',
    '- {"type":"team_request_audit_export","format":"json|csv","rangeHours":168}',
    '- {"type":"team_refresh_audit_exports"}',
    '- {"type":"set_preference","key":"glasses.enabled|glasses.voiceAutoSend|glasses.voiceLoop|glasses.wakePhraseEnabled|glasses.minimalMode|glasses.textScale|start.aiEngine|start.kind","value":true|false|number|"auto"|"server"|"external"|"ai"|"shell"}',
    '- {"type":"set_pool_paused","paused":true|false}',
    "",
    "Current app context:",
    serializeContext(args.context),
    "",
    "Recent conversation:",
    serializeHistory(args.history) || "(none)",
    "",
    `Latest user message: ${args.input.trim()}`,
  ].join("\n");
}

export function buildNovaAssistantToolPrompt(args: {
  history: NovaAssistantMessage[];
  context: NovaAssistantRuntimeContext;
  input: string;
}): string {
  return [
    "You are Nova, the conversational control layer for the NovaRemote app.",
    "Respond conversationally. If app actions are needed, call the plan_nova_actions tool with a short reply and the structured actions to execute.",
    "If no app action is needed, answer normally and do not call the tool.",
    "Rules:",
    "- Prefer exact server IDs or exact server names from context.",
    '- You may use placeholders "$focused_server", "$focused_session", and "$last_session".',
    "- Do not invent servers, sessions, routes, links, or settings keys.",
    "- Dangerous shell commands may require confirmation in-app; it is still valid to request those actions when the user explicitly asks for them.",
    "Available action types for the tool: navigate, focus_server, focus_session, create_session, send_command, set_draft, stop_session, list_files, open_file, tail_file, create_folder, save_file, refresh_processes, kill_process, open_server_link, create_agent, update_agent, approve_agents, deny_agents, team_refresh, team_open_dashboard, team_sync_audit, team_request_audit_export, team_refresh_audit_exports, set_preference, set_pool_paused.",
    "",
    "Current app context:",
    serializeContext(args.context),
    "",
    "Recent conversation:",
    serializeHistory(args.history) || "(none)",
    "",
    `Latest user message: ${args.input.trim()}`,
  ].join("\n");
}

export function buildNovaAssistantPlanningTool(): LlmToolDefinition {
  return {
    name: NOVA_ASSISTANT_TOOL_NAME,
    description:
      "Queue NovaRemote app actions and include the short user-facing reply that should accompany those actions.",
    parameters: {
      type: "object",
      properties: {
        reply: {
          type: "string",
          description: "Short natural-language response to the user about what Nova is doing.",
        },
        actions: {
          type: "array",
          description: "Ordered app actions for NovaRemote to execute.",
          items: {
            type: "object",
            properties: {
              type: {
                type: "string",
                enum: [
                  "navigate",
                  "focus_server",
                  "focus_session",
                  "create_session",
                  "send_command",
                  "set_draft",
                  "stop_session",
                  "list_files",
                  "open_file",
                  "tail_file",
                  "create_folder",
                  "save_file",
                  "refresh_processes",
                  "kill_process",
                  "open_server_link",
                  "create_agent",
                  "update_agent",
                  "approve_agents",
                  "deny_agents",
                  "team_refresh",
                  "team_open_dashboard",
                  "team_sync_audit",
                  "team_request_audit_export",
                  "team_refresh_audit_exports",
                  "set_preference",
                  "set_pool_paused",
                ],
              },
              route: { type: "string" },
              serverRef: { type: "string" },
              sessionRef: { type: "string" },
              kind: { type: "string", enum: ["ai", "shell"] },
              prompt: { type: "string" },
              command: { type: "string" },
              mode: { type: "string", enum: ["ai", "shell"] },
              createIfMissing: { type: "boolean" },
              createKind: { type: "string", enum: ["ai", "shell"] },
              text: { type: "string" },
              path: { type: "string" },
              includeHidden: { type: "boolean" },
              lines: { type: "number" },
              content: { type: "string" },
              pid: { type: "number" },
              signal: { type: "string", enum: ["TERM", "KILL", "INT"] },
              target: { type: "string", enum: ["ssh", "portainer", "proxmox", "grafana"] },
              name: { type: "string" },
              status: { type: "string", enum: ["idle", "monitoring", "executing", "waiting_approval"] },
              goal: { type: "string" },
              queuedCommand: { type: "string" },
              format: { type: "string", enum: ["json", "csv"] },
              rangeHours: { type: "number" },
              key: {
                type: "string",
                enum: [
                  "glasses.enabled",
                  "glasses.voiceAutoSend",
                  "glasses.voiceLoop",
                  "glasses.wakePhraseEnabled",
                  "glasses.minimalMode",
                  "glasses.textScale",
                  "start.aiEngine",
                  "start.kind",
                ],
              },
              value: {
                description: "Preference value for set_preference actions.",
              },
              paused: { type: "boolean" },
            },
            required: ["type"],
            additionalProperties: false,
          },
        },
      },
      required: ["reply", "actions"],
      additionalProperties: false,
    },
    run: (args) => {
      const plan = parseNovaAssistantPlan(JSON.stringify(args));
      return JSON.stringify({
        accepted: true,
        reply: plan.reply,
        actionCount: plan.actions.length,
      });
    },
  };
}

export function extractNovaAssistantToolPlan(toolCalls: LlmToolExecution[]): NovaAssistantPlan | null {
  const plans = toolCalls
    .filter((call) => call.name === NOVA_ASSISTANT_TOOL_NAME)
    .map((call) => parseNovaAssistantPlan(call.arguments));
  if (plans.length === 0) {
    return null;
  }
  return {
    reply:
      plans
        .map((plan) => plan.reply.trim())
        .filter(Boolean)
        .at(-1) || "",
    actions: plans.flatMap((plan) => plan.actions),
  };
}

export function parseNovaAssistantPlan(raw: string): NovaAssistantPlan {
  const parsed = extractJsonObject(raw);
  if (!parsed) {
    return {
      reply: raw.trim() || "I did not receive a usable response from the model.",
      actions: [],
    };
  }
  const reply = trimText(parsed.reply || parsed.message || parsed.text) || "Done.";
  const actions = Array.isArray(parsed.actions) ? parsed.actions.map(normalizeAction).filter((entry): entry is NovaAssistantAction => Boolean(entry)) : [];
  return { reply, actions };
}

export function resolveAssistantServer(
  context: NovaAssistantRuntimeContext,
  rawRef?: string | null
): NovaAssistantServerContext | null {
  const reference = trimText(rawRef);
  if (!reference || reference === "$focused_server" || reference === "focused" || reference === "current server") {
    return context.servers.find((server) => server.id === context.focusedServerId) || context.servers[0] || null;
  }

  const normalized = normalizeForMatch(reference);
  const direct = context.servers.find((server) => {
    return (
      normalizeForMatch(server.id) === normalized ||
      normalizeForMatch(server.name) === normalized ||
      normalizeForMatch(server.vmHost || "") === normalized ||
      normalizeForMatch(server.vmName || "") === normalized ||
      normalizeForMatch(server.vmId || "") === normalized
    );
  });
  if (direct) {
    return direct;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  let winner: NovaAssistantServerContext | null = null;
  let winnerScore = 0;
  context.servers.forEach((server) => {
    const values = [
      normalizeForMatch(server.id),
      normalizeForMatch(server.name),
      normalizeForMatch(server.vmHost || ""),
      normalizeForMatch(server.vmType || ""),
      normalizeForMatch(server.vmName || ""),
      normalizeForMatch(server.vmId || ""),
    ];
    let score = 0;
    tokens.forEach((token) => {
      values.forEach((value, index) => {
        if (!value.includes(token)) {
          return;
        }
        score += index <= 1 ? 3 : 2;
      });
    });
    if (score > winnerScore) {
      winner = server;
      winnerScore = score;
    }
  });
  return winnerScore > 0 ? winner : null;
}

export function resolveAssistantSession(
  context: NovaAssistantRuntimeContext,
  server: NovaAssistantServerContext,
  rawRef?: string | null,
  lastCreatedSession?: string | null
): NovaAssistantSessionContext | null {
  const reference = trimText(rawRef);
  if (!reference || reference === "$focused_session" || reference === "focused" || reference === "current session") {
    if (server.id === context.focusedServerId && context.focusedSession) {
      return server.sessions.find((session) => session.session === context.focusedSession) || null;
    }
    return server.sessions[0] || null;
  }
  if (reference === "$last_session" && lastCreatedSession) {
    return server.sessions.find((session) => session.session === lastCreatedSession) || null;
  }

  const normalized = normalizeForMatch(reference);
  const direct = server.sessions.find((session) => normalizeForMatch(session.session) === normalized);
  if (direct) {
    return direct;
  }

  const tokens = normalized.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  let winner: NovaAssistantSessionContext | null = null;
  let winnerScore = 0;
  server.sessions.forEach((session) => {
    const name = normalizeForMatch(session.session);
    let score = 0;
    tokens.forEach((token) => {
      if (name.includes(token)) {
        score += 3;
      }
    });
    if (score > winnerScore) {
      winner = session;
      winnerScore = score;
    }
  });
  return winnerScore > 0 ? winner : null;
}

export function formatNovaAssistantExecutionSummary(results: NovaAssistantExecutionResult[]): string {
  if (results.length === 0) {
    return "";
  }
  const lines = results.map((result) => `${result.ok ? "OK" : "Failed"}: ${result.detail}`);
  return `\n\nExecution\n${lines.join("\n")}`;
}

export const novaAssistantTestUtils = {
  normalizeAction,
  extractJsonObject,
};

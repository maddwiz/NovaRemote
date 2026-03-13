import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest, normalizeBaseUrl } from "../api/client";
import {
  NovaAdaptBridgeCapabilities,
  NovaAdaptBridgeControlArtifact,
  NovaAdaptBridgeControlArtifactDetail,
  NovaAdaptBridgeGovernance,
  NovaAdaptBridgeHealth,
  NovaAdaptBridgeJob,
  NovaAdaptBridgeMemoryStatus,
  NovaAdaptBridgePlan,
  NovaAdaptBridgeSurfaceStatus,
  NovaAdaptBridgeTemplate,
  NovaAdaptBridgeWorkflow,
  ServerProfile,
} from "../types";

type UseNovaAdaptBridgeArgs = {
  server: ServerProfile | null;
  enabled?: boolean;
  refreshIntervalMs?: number;
};

type RefreshOptions = {
  quiet?: boolean;
};

export type UseNovaAdaptBridgeResult = {
  loading: boolean;
  refreshing: boolean;
  supported: boolean;
  runtimeAvailable: boolean;
  capabilities: NovaAdaptBridgeCapabilities;
  error: string | null;
  health: NovaAdaptBridgeHealth | null;
  memoryStatus: NovaAdaptBridgeMemoryStatus | null;
  browserStatus: NovaAdaptBridgeSurfaceStatus | null;
  voiceStatus: NovaAdaptBridgeSurfaceStatus | null;
  canvasStatus: NovaAdaptBridgeSurfaceStatus | null;
  mobileStatus: NovaAdaptBridgeSurfaceStatus | null;
  homeAssistantStatus: NovaAdaptBridgeSurfaceStatus | null;
  mqttStatus: NovaAdaptBridgeSurfaceStatus | null;
  controlArtifacts: NovaAdaptBridgeControlArtifact[];
  governance: NovaAdaptBridgeGovernance | null;
  plans: NovaAdaptBridgePlan[];
  jobs: NovaAdaptBridgeJob[];
  workflows: NovaAdaptBridgeWorkflow[];
  templates: NovaAdaptBridgeTemplate[];
  galleryTemplates: NovaAdaptBridgeTemplate[];
  loadControlArtifact: (artifactId: string) => Promise<NovaAdaptBridgeControlArtifactDetail | null>;
  refresh: (options?: RefreshOptions) => Promise<void>;
  createPlan: (objective: string, options?: { strategy?: string }) => Promise<NovaAdaptBridgePlan | null>;
  startWorkflow: (
    objective: string,
    options?: { metadata?: Record<string, unknown>; autoResume?: boolean }
  ) => Promise<NovaAdaptBridgeWorkflow | null>;
  importTemplate: (template: NovaAdaptBridgeTemplate) => Promise<NovaAdaptBridgeTemplate | null>;
  launchTemplate: (
    templateId: string,
    options?: { mode?: "plan" | "workflow" | "run"; execute?: boolean; allowDangerous?: boolean }
  ) => Promise<boolean>;
  resumeWorkflow: (workflowId: string) => Promise<boolean>;
  approvePlanAsync: (planId: string) => Promise<boolean>;
  rejectPlan: (planId: string, reason?: string) => Promise<boolean>;
  retryFailedPlanAsync: (planId: string) => Promise<boolean>;
  undoPlan: (planId: string) => Promise<boolean>;
  pauseRuntime: (reason?: string) => Promise<boolean>;
  resumeRuntime: () => Promise<boolean>;
  resetGovernanceUsage: () => Promise<boolean>;
  cancelAllJobs: (reason?: string) => Promise<boolean>;
};

type RawBridgeJob = {
  id?: unknown;
  status?: unknown;
  created_at?: unknown;
  started_at?: unknown;
  finished_at?: unknown;
  error?: unknown;
};

type RawBridgePlan = {
  id?: unknown;
  objective?: unknown;
  status?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  progress_completed?: unknown;
  progress_total?: unknown;
  execution_error?: unknown;
  reject_reason?: unknown;
};

type RawBridgeWorkflow = {
  workflow_id?: unknown;
  status?: unknown;
  objective?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  last_error?: unknown;
  context?: unknown;
};

type RawWorkflowsResponse = {
  workflows?: unknown;
};

type RawTemplateStep = {
  name?: unknown;
  objective?: unknown;
};

type RawBridgeTemplate = {
  template_id?: unknown;
  name?: unknown;
  description?: unknown;
  objective?: unknown;
  strategy?: unknown;
  candidates?: unknown;
  tags?: unknown;
  source?: unknown;
  shared?: unknown;
  share_token?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  metadata?: unknown;
  steps?: unknown;
};

type RawTemplatesResponse = {
  templates?: unknown;
};

type RawCapabilitiesResponse = {
  ok?: unknown;
  checked_at?: unknown;
  cached?: unknown;
  protocol_version?: unknown;
  protocolVersion?: unknown;
  agent_contract_version?: unknown;
  agentContractVersion?: unknown;
  capabilities?: unknown;
};

type RawBridgeHealth = {
  ok?: unknown;
  protocol_version?: unknown;
  protocolVersion?: unknown;
  agent_contract_version?: unknown;
  agentContractVersion?: unknown;
  [key: string]: unknown;
};

type RawBridgeGovernance = {
  paused?: unknown;
  pause_reason?: unknown;
  budget_limit_usd?: unknown;
  max_active_runs?: unknown;
  active_runs?: unknown;
  runs_total?: unknown;
  llm_calls_total?: unknown;
  spend_estimate_usd?: unknown;
  updated_at?: unknown;
  last_run_at?: unknown;
  last_objective_preview?: unknown;
  last_strategy?: unknown;
  jobs?: unknown;
};

type RawBridgeSurfaceStatus = Record<string, unknown> | null;

type RawBridgeControlArtifact = {
  artifact_id?: unknown;
  created_at?: unknown;
  control_type?: unknown;
  status?: unknown;
  dangerous?: unknown;
  goal?: unknown;
  platform?: unknown;
  transport?: unknown;
  output_preview?: unknown;
  action_type?: unknown;
  target?: unknown;
  model?: unknown;
  model_id?: unknown;
  preview_available?: unknown;
  preview_path?: unknown;
  detail_path?: unknown;
  output?: unknown;
  action?: unknown;
  data?: unknown;
  metadata?: unknown;
};

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_SECONDS = 300;
const STREAM_INTERVAL_SECONDS = 0.25;
const MAX_ACTIVE_PLAN_STREAMS = 3;
const MAX_ACTIVE_JOB_STREAMS = 3;
const EVENT_STREAM_RECONNECT_DELAY_MS = 500;
const EVENT_REFRESH_DEBOUNCE_MS = 250;

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNullableString(value: unknown): string | null {
  const next = asString(value).trim();
  return next || null;
}

function asInteger(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.max(0, Math.floor(value));
  }
  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return Math.max(0, parsed);
    }
  }
  return 0;
}

function asNullableNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return null;
}

function isBridgeUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return (
    message.includes("404") ||
    message.includes("503") ||
    message.includes("novaadapt bridge is not configured") ||
    message.includes("upstream unavailable")
  );
}

function isMissingRouteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return message.includes("404");
}

function capabilityFromSettled(result: PromiseSettledResult<unknown>): boolean {
  if (result.status === "fulfilled") {
    return true;
  }
  return !isMissingRouteError(result.reason);
}

function normalizeCapabilities(value: unknown): NovaAdaptBridgeCapabilities {
  const raw = value as Partial<Record<keyof NovaAdaptBridgeCapabilities, unknown>> | null;
  return {
    protocolVersion: asNullableString(raw?.protocolVersion ?? (raw as { protocol_version?: unknown } | null)?.protocol_version),
    agentContractVersion: asNullableString(
      raw?.agentContractVersion ?? (raw as { agent_contract_version?: unknown } | null)?.agent_contract_version
    ),
    memoryStatus: Boolean(raw?.memoryStatus),
    governance: Boolean(raw?.governance),
    workflows: Boolean(raw?.workflows),
    templates: Boolean(raw?.templates),
    templateGallery: Boolean(raw?.templateGallery),
    browserStatus: Boolean(raw?.browserStatus),
    voiceStatus: Boolean(raw?.voiceStatus),
    canvasStatus: Boolean(raw?.canvasStatus),
    mobileStatus: Boolean(raw?.mobileStatus),
    homeAssistantStatus: Boolean(raw?.homeAssistantStatus),
    mqttStatus: Boolean(raw?.mqttStatus),
    controlArtifacts: Boolean(raw?.controlArtifacts),
  };
}

function normalizeHealth(value: unknown): NovaAdaptBridgeHealth {
  const raw = (value as RawBridgeHealth | null) ?? {};
  return {
    ...raw,
    ok: Boolean(raw.ok),
    protocolVersion: asNullableString(raw.protocolVersion ?? raw.protocol_version),
    agentContractVersion: asNullableString(raw.agentContractVersion ?? raw.agent_contract_version),
  };
}

function normalizeSurfaceStatus(value: unknown): NovaAdaptBridgeSurfaceStatus | null {
  const raw = value as RawBridgeSurfaceStatus;
  if (!raw || typeof raw !== "object") {
    return null;
  }
  return {
    ok: Boolean(raw.ok),
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : undefined,
    configured: typeof raw.configured === "boolean" ? raw.configured : undefined,
    transport: asNullableString(raw.transport),
    platform: asNullableString(raw.platform),
    context: asNullableString(raw.context),
    backend: asNullableString(raw.backend),
    error: asNullableString(raw.error),
    details: { ...raw },
  };
}

function normalizeControlArtifact(value: unknown): NovaAdaptBridgeControlArtifact | null {
  const raw = value as RawBridgeControlArtifact | null;
  const artifactId = asString(raw?.artifact_id).trim();
  const controlType = asString(raw?.control_type).trim();
  const status = asString(raw?.status).trim();
  if (!artifactId || !controlType || !status) {
    return null;
  }
  return {
    artifactId,
    createdAt: asNullableString(raw?.created_at),
    controlType,
    status,
    dangerous: Boolean(raw?.dangerous),
    goal: asString(raw?.goal).trim(),
    platform: asNullableString(raw?.platform),
    transport: asNullableString(raw?.transport),
    outputPreview: asNullableString(raw?.output_preview),
    actionType: asNullableString(raw?.action_type),
    target: asNullableString(raw?.target),
    model: asNullableString(raw?.model),
    modelId: asNullableString(raw?.model_id),
    previewAvailable: Boolean(raw?.preview_available),
    previewPath: asNullableString(raw?.preview_path),
    detailPath: asNullableString(raw?.detail_path),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return { ...(value as Record<string, unknown>) };
}

function normalizeControlArtifactDetail(value: unknown): NovaAdaptBridgeControlArtifactDetail | null {
  const artifact = normalizeControlArtifact(value);
  if (!artifact) {
    return null;
  }
  const raw = value as RawBridgeControlArtifact | null;
  return {
    ...artifact,
    output: asNullableString(raw?.output),
    action: asRecord(raw?.action),
    data: asRecord(raw?.data),
    metadata: asRecord(raw?.metadata),
  };
}

function normalizePlan(value: unknown): NovaAdaptBridgePlan | null {
  const raw = value as RawBridgePlan | null;
  const id = asString(raw?.id).trim();
  const objective = asString(raw?.objective).trim();
  const status = asString(raw?.status).trim();
  if (!id || !objective || !status) {
    return null;
  }
  return {
    id,
    objective,
    status,
    createdAt: asNullableString(raw?.created_at),
    updatedAt: asNullableString(raw?.updated_at),
    progressCompleted: asInteger(raw?.progress_completed),
    progressTotal: asInteger(raw?.progress_total),
    executionError: asNullableString(raw?.execution_error),
    rejectReason: asNullableString(raw?.reject_reason),
  };
}

function normalizeJob(value: unknown): NovaAdaptBridgeJob | null {
  const raw = value as RawBridgeJob | null;
  const id = asString(raw?.id).trim();
  const status = asString(raw?.status).trim();
  if (!id || !status) {
    return null;
  }
  return {
    id,
    status,
    createdAt: asNullableString(raw?.created_at),
    startedAt: asNullableString(raw?.started_at),
    finishedAt: asNullableString(raw?.finished_at),
    error: asNullableString(raw?.error),
  };
}

function normalizeWorkflow(value: unknown): NovaAdaptBridgeWorkflow | null {
  const raw = value as RawBridgeWorkflow | null;
  const workflowId = asString(raw?.workflow_id).trim();
  const objective = asString(raw?.objective).trim();
  const status = asString(raw?.status).trim();
  if (!workflowId || !objective || !status) {
    return null;
  }
  return {
    workflowId,
    objective,
    status,
    createdAt: asNullableString(raw?.created_at),
    updatedAt: asNullableString(raw?.updated_at),
    lastError: asNullableString(raw?.last_error),
    context: raw?.context && typeof raw.context === "object" ? { ...(raw.context as Record<string, unknown>) } : {},
  };
}

function normalizeGovernance(value: unknown): NovaAdaptBridgeGovernance | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as RawBridgeGovernance;
  const jobs = raw.jobs && typeof raw.jobs === "object" ? (raw.jobs as Record<string, unknown>) : {};
  return {
    paused: Boolean(raw.paused),
    pauseReason: asNullableString(raw.pause_reason),
    budgetLimitUsd: asNullableNumber(raw.budget_limit_usd),
    maxActiveRuns: asNullableNumber(raw.max_active_runs),
    activeRuns: asInteger(raw.active_runs),
    runsTotal: asInteger(raw.runs_total),
    llmCallsTotal: asInteger(raw.llm_calls_total),
    spendEstimateUsd: asNullableNumber(raw.spend_estimate_usd) ?? 0,
    updatedAt: asNullableString(raw.updated_at),
    lastRunAt: asNullableString(raw.last_run_at),
    lastObjectivePreview: asNullableString(raw.last_objective_preview),
    lastStrategy: asNullableString(raw.last_strategy),
    jobs: {
      active: asInteger(jobs.active),
      queued: asInteger(jobs.queued),
      running: asInteger(jobs.running),
      maxWorkers: asInteger(jobs.max_workers),
    },
  };
}

function normalizeTemplateStep(value: unknown) {
  const raw = value as RawTemplateStep | null;
  const name = asString(raw?.name).trim();
  const objective = asString(raw?.objective).trim();
  if (!name || !objective) {
    return null;
  }
  return { name, objective };
}

function normalizeTemplate(value: unknown): NovaAdaptBridgeTemplate | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const raw = value as RawBridgeTemplate;
  const templateId = asString(raw.template_id).trim();
  const name = asString(raw.name).trim();
  const objective = asString(raw.objective).trim();
  if (!templateId || !name || !objective) {
    return null;
  }
  return {
    templateId,
    name,
    description: asString(raw.description).trim(),
    objective,
    strategy: asString(raw.strategy).trim() || "single",
    candidates: Array.isArray(raw.candidates)
      ? raw.candidates.map((item) => String(item).trim()).filter(Boolean)
      : [],
    tags: Array.isArray(raw.tags) ? raw.tags.map((item) => String(item).trim()).filter(Boolean) : [],
    source: asString(raw.source).trim() || "local",
    shared: Boolean(raw.shared),
    shareToken: asNullableString(raw.share_token),
    createdAt: asNullableString(raw.created_at),
    updatedAt: asNullableString(raw.updated_at),
    metadata: raw.metadata && typeof raw.metadata === "object" ? { ...(raw.metadata as Record<string, unknown>) } : {},
    steps: Array.isArray(raw.steps)
      ? raw.steps
          .map(normalizeTemplateStep)
          .filter((item): item is NonNullable<ReturnType<typeof normalizeTemplateStep>> => Boolean(item))
      : [],
  };
}

function sortNewest<T extends { updatedAt?: string | null; createdAt?: string | null }>(items: T[]): T[] {
  return items.slice().sort((a, b) => {
    const aTs = Date.parse(a.updatedAt || a.createdAt || "") || 0;
    const bTs = Date.parse(b.updatedAt || b.createdAt || "") || 0;
    return bTs - aTs;
  });
}

function supportsBodyStreaming(body: ReadableStream<Uint8Array> | null | undefined): body is ReadableStream<Uint8Array> {
  return Boolean(body && typeof body.getReader === "function");
}

function splitStreamBuffer(buffer: string) {
  const normalized = buffer.replace(/\r/g, "");
  const parts = normalized.split("\n");
  const remainder = parts.pop() || "";
  return {
    lines: parts.map((line) => line.trimEnd()),
    remainder,
  };
}

type SseEvent = {
  event: string;
  data: string;
};

type RawBridgeAuditEvent = {
  id?: unknown;
  category?: unknown;
  action?: unknown;
  entity_type?: unknown;
};

const DEFAULT_BRIDGE_CAPABILITIES: NovaAdaptBridgeCapabilities = {
  protocolVersion: null,
  agentContractVersion: null,
  memoryStatus: false,
  governance: false,
  workflows: false,
  templates: false,
  templateGallery: false,
  browserStatus: false,
  voiceStatus: false,
  canvasStatus: false,
  mobileStatus: false,
  homeAssistantStatus: false,
  mqttStatus: false,
  controlArtifacts: false,
};

function extractSseEvents(lines: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  let eventName = "message";
  const dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      eventName = "message";
      return;
    }
    events.push({
      event: eventName || "message",
      data: dataLines.join("\n"),
    });
    eventName = "message";
    dataLines.length = 0;
  };

  lines.forEach((line) => {
    if (!line) {
      flush();
      return;
    }
    if (line.startsWith("event:")) {
      eventName = line.slice(6).trim() || "message";
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });

  return events;
}

function isActivePlanStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized === "pending" || normalized === "executing";
}

function isActiveJobStatus(status: string): boolean {
  const normalized = status.trim().toLowerCase();
  return normalized !== "succeeded" && normalized !== "failed" && normalized !== "canceled";
}

function isRelevantBridgeAuditEvent(value: unknown): boolean {
  const raw = value as RawBridgeAuditEvent | null;
  const category = asString(raw?.category).trim().toLowerCase();
  const action = asString(raw?.action).trim().toLowerCase();
  const entityType = asString(raw?.entity_type).trim().toLowerCase();
  if (category === "plans" || category === "jobs" || category === "memory") {
    return true;
  }
  if (category === "control" || category === "artifacts") {
    return true;
  }
  if (entityType === "plan" || entityType === "job" || entityType === "memory") {
    return true;
  }
  if (entityType === "artifact" || entityType === "surface") {
    return true;
  }
  if (action === "approve" || action === "approve_async" || action === "retry_failed" || action === "retry_failed_async") {
    return true;
  }
  return false;
}

function upsertById<T extends { id: string; updatedAt?: string | null; createdAt?: string | null }>(items: T[], nextItem: T): T[] {
  const index = items.findIndex((item) => item.id === nextItem.id);
  if (index < 0) {
    return sortNewest([nextItem, ...items]);
  }
  const next = items.slice();
  next[index] = nextItem;
  return sortNewest(next);
}

function sameIdSet(a: Set<string>, b: string[]): boolean {
  if (a.size !== b.length) {
    return false;
  }
  return b.every((value) => a.has(value));
}

export const novaAdaptBridgeTestUtils = {
  extractSseEvents,
  splitStreamBuffer,
};

export type NovaAdaptBridgeSnapshot = {
  supported: boolean;
  runtimeAvailable: boolean;
  capabilities: NovaAdaptBridgeCapabilities;
  error: string | null;
  health: NovaAdaptBridgeHealth | null;
  memoryStatus: NovaAdaptBridgeMemoryStatus | null;
  browserStatus: NovaAdaptBridgeSurfaceStatus | null;
  voiceStatus: NovaAdaptBridgeSurfaceStatus | null;
  canvasStatus: NovaAdaptBridgeSurfaceStatus | null;
  mobileStatus: NovaAdaptBridgeSurfaceStatus | null;
  homeAssistantStatus: NovaAdaptBridgeSurfaceStatus | null;
  mqttStatus: NovaAdaptBridgeSurfaceStatus | null;
  controlArtifacts: NovaAdaptBridgeControlArtifact[];
  governance: NovaAdaptBridgeGovernance | null;
  plans: NovaAdaptBridgePlan[];
  jobs: NovaAdaptBridgeJob[];
  workflows: NovaAdaptBridgeWorkflow[];
  templates: NovaAdaptBridgeTemplate[];
  galleryTemplates: NovaAdaptBridgeTemplate[];
};

type BridgeSnapshotOptions = {
  planLimit?: number;
  jobLimit?: number;
  workflowLimit?: number;
};

function hasBridgeCredentials(server: ServerProfile | null | undefined): server is ServerProfile {
  return Boolean(server && normalizeBaseUrl(server.baseUrl) && server.token.trim());
}

export async function fetchNovaAdaptBridgeSnapshot(
  server: ServerProfile | null,
  options: BridgeSnapshotOptions = {}
): Promise<NovaAdaptBridgeSnapshot> {
  if (!hasBridgeCredentials(server)) {
    return {
      supported: false,
      runtimeAvailable: false,
      capabilities: DEFAULT_BRIDGE_CAPABILITIES,
      error: null,
      health: null,
      memoryStatus: null,
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
    };
  }

  const planLimit = Math.max(1, Math.min(100, options.planLimit ?? 12));
  const jobLimit = Math.max(1, Math.min(100, options.jobLimit ?? 12));
  const workflowLimit = Math.max(1, Math.min(100, options.workflowLimit ?? 12));

  try {
    const healthResponse = await apiRequest<RawBridgeHealth>(server.baseUrl, server.token, "/agents/health?deep=1");
    const nextHealth = normalizeHealth(healthResponse);
    let bridgeCapabilities: NovaAdaptBridgeCapabilities | null = null;
    let capabilityPresence: Partial<Record<keyof NovaAdaptBridgeCapabilities, boolean>> = {};
    try {
      const capabilitiesResponse = await apiRequest<RawCapabilitiesResponse>(
        server.baseUrl,
        server.token,
        "/agents/capabilities"
      );
      const capabilityPayload =
        capabilitiesResponse?.capabilities && typeof capabilitiesResponse.capabilities === "object"
          ? {
              ...(capabilitiesResponse.capabilities as Record<string, unknown>),
              protocolVersion: capabilitiesResponse.protocolVersion ?? capabilitiesResponse.protocol_version,
              agentContractVersion:
                capabilitiesResponse.agentContractVersion ?? capabilitiesResponse.agent_contract_version,
            }
          : capabilitiesResponse;
      if (capabilityPayload && typeof capabilityPayload === "object") {
        const rawCapabilityPayload = capabilityPayload as Record<string, unknown>;
        capabilityPresence = {
          protocolVersion: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "protocolVersion"),
          agentContractVersion: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "agentContractVersion"),
          memoryStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "memoryStatus"),
          governance: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "governance"),
          workflows: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "workflows"),
          templates: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "templates"),
          templateGallery: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "templateGallery"),
          browserStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "browserStatus"),
          voiceStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "voiceStatus"),
          canvasStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "canvasStatus"),
          mobileStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "mobileStatus"),
          homeAssistantStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "homeAssistantStatus"),
          mqttStatus: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "mqttStatus"),
          controlArtifacts: Object.prototype.hasOwnProperty.call(rawCapabilityPayload, "controlArtifacts"),
        };
      }
      bridgeCapabilities = normalizeCapabilities(capabilityPayload);
    } catch (capabilitiesError) {
      if (!isMissingRouteError(capabilitiesError) && !isBridgeUnavailableError(capabilitiesError)) {
        bridgeCapabilities = null;
      }
    }

    const [
      plansResult,
      jobsResult,
      memoryResult,
      browserStatusResult,
      voiceStatusResult,
      canvasStatusResult,
      mobileStatusResult,
      homeAssistantStatusResult,
      mqttStatusResult,
      controlArtifactsResult,
      workflowsResult,
      governanceResult,
      templatesResult,
      galleryResult,
    ] = await Promise.allSettled([
      apiRequest<unknown>(server.baseUrl, server.token, `/agents/plans?limit=${planLimit}`),
      apiRequest<unknown>(server.baseUrl, server.token, `/agents/jobs?limit=${jobLimit}`),
      bridgeCapabilities && capabilityPresence.memoryStatus && !bridgeCapabilities.memoryStatus
        ? Promise.resolve(null)
        : apiRequest<NovaAdaptBridgeMemoryStatus>(server.baseUrl, server.token, "/agents/memory/status"),
      bridgeCapabilities && capabilityPresence.browserStatus && !bridgeCapabilities.browserStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/browser/status"),
      bridgeCapabilities && capabilityPresence.voiceStatus && !bridgeCapabilities.voiceStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/voice/status"),
      bridgeCapabilities && capabilityPresence.canvasStatus && !bridgeCapabilities.canvasStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/canvas/status"),
      bridgeCapabilities && capabilityPresence.mobileStatus && !bridgeCapabilities.mobileStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/mobile/status"),
      bridgeCapabilities && capabilityPresence.homeAssistantStatus && !bridgeCapabilities.homeAssistantStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/iot/homeassistant/status"),
      bridgeCapabilities && capabilityPresence.mqttStatus && !bridgeCapabilities.mqttStatus
        ? Promise.resolve(null)
        : apiRequest<RawBridgeSurfaceStatus>(server.baseUrl, server.token, "/agents/iot/mqtt/status"),
      bridgeCapabilities && capabilityPresence.controlArtifacts && !bridgeCapabilities.controlArtifacts
        ? Promise.resolve(null)
        : apiRequest<unknown>(server.baseUrl, server.token, "/agents/control/artifacts?limit=6"),
      bridgeCapabilities && capabilityPresence.workflows && !bridgeCapabilities.workflows
        ? Promise.resolve(null)
        : apiRequest<RawWorkflowsResponse>(
            server.baseUrl,
            server.token,
            `/agents/workflows/list?limit=${workflowLimit}&context=api`
          ),
      bridgeCapabilities && capabilityPresence.governance && !bridgeCapabilities.governance
        ? Promise.resolve(null)
        : apiRequest<unknown>(server.baseUrl, server.token, "/agents/runtime/governance"),
      bridgeCapabilities && capabilityPresence.templates && !bridgeCapabilities.templates
        ? Promise.resolve(null)
        : apiRequest<RawTemplatesResponse>(server.baseUrl, server.token, "/agents/templates?limit=12"),
      bridgeCapabilities && capabilityPresence.templateGallery && !bridgeCapabilities.templateGallery
        ? Promise.resolve(null)
        : apiRequest<RawTemplatesResponse>(server.baseUrl, server.token, "/agents/gallery"),
    ]);

    const inferredCapabilities = {
      protocolVersion: bridgeCapabilities?.protocolVersion ?? null,
      agentContractVersion: bridgeCapabilities?.agentContractVersion ?? null,
      memoryStatus:
        capabilityPresence.memoryStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.memoryStatus)
          : capabilityFromSettled(memoryResult),
      governance:
        capabilityPresence.governance && bridgeCapabilities
          ? Boolean(bridgeCapabilities.governance)
          : capabilityFromSettled(governanceResult),
      workflows:
        capabilityPresence.workflows && bridgeCapabilities
          ? Boolean(bridgeCapabilities.workflows)
          : capabilityFromSettled(workflowsResult),
      templates:
        capabilityPresence.templates && bridgeCapabilities
          ? Boolean(bridgeCapabilities.templates)
          : capabilityFromSettled(templatesResult),
      templateGallery:
        capabilityPresence.templateGallery && bridgeCapabilities
          ? Boolean(bridgeCapabilities.templateGallery)
          : capabilityFromSettled(galleryResult),
      browserStatus:
        capabilityPresence.browserStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.browserStatus)
          : capabilityFromSettled(browserStatusResult),
      voiceStatus:
        capabilityPresence.voiceStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.voiceStatus)
          : capabilityFromSettled(voiceStatusResult),
      canvasStatus:
        capabilityPresence.canvasStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.canvasStatus)
          : capabilityFromSettled(canvasStatusResult),
      mobileStatus:
        capabilityPresence.mobileStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.mobileStatus)
          : capabilityFromSettled(mobileStatusResult),
      homeAssistantStatus:
        capabilityPresence.homeAssistantStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.homeAssistantStatus)
          : capabilityFromSettled(homeAssistantStatusResult),
      mqttStatus:
        capabilityPresence.mqttStatus && bridgeCapabilities
          ? Boolean(bridgeCapabilities.mqttStatus)
          : capabilityFromSettled(mqttStatusResult),
      controlArtifacts:
        capabilityPresence.controlArtifacts && bridgeCapabilities
          ? Boolean(bridgeCapabilities.controlArtifacts)
          : capabilityFromSettled(controlArtifactsResult),
    } satisfies NovaAdaptBridgeCapabilities;

    const effectiveCapabilities =
      bridgeCapabilities ? { ...bridgeCapabilities, ...inferredCapabilities } : inferredCapabilities;

    return {
      supported: true,
      runtimeAvailable: Boolean(nextHealth.ok),
      capabilities: effectiveCapabilities,
      error: null,
      health: nextHealth,
      memoryStatus: memoryResult.status === "fulfilled" ? memoryResult.value : null,
      browserStatus:
        browserStatusResult.status === "fulfilled" ? normalizeSurfaceStatus(browserStatusResult.value) : null,
      voiceStatus:
        voiceStatusResult.status === "fulfilled" ? normalizeSurfaceStatus(voiceStatusResult.value) : null,
      canvasStatus:
        canvasStatusResult.status === "fulfilled" ? normalizeSurfaceStatus(canvasStatusResult.value) : null,
      mobileStatus:
        mobileStatusResult.status === "fulfilled" ? normalizeSurfaceStatus(mobileStatusResult.value) : null,
      homeAssistantStatus:
        homeAssistantStatusResult.status === "fulfilled"
          ? normalizeSurfaceStatus(homeAssistantStatusResult.value)
          : null,
      mqttStatus:
        mqttStatusResult.status === "fulfilled" ? normalizeSurfaceStatus(mqttStatusResult.value) : null,
      controlArtifacts:
        controlArtifactsResult.status === "fulfilled" && Array.isArray(controlArtifactsResult.value)
          ? sortNewest(
              controlArtifactsResult.value
                .map(normalizeControlArtifact)
                .filter((item): item is NovaAdaptBridgeControlArtifact => Boolean(item))
            ).slice(0, 6)
          : [],
      governance: governanceResult.status === "fulfilled" ? normalizeGovernance(governanceResult.value) : null,
      plans:
        plansResult.status === "fulfilled" && Array.isArray(plansResult.value)
          ? sortNewest(plansResult.value.map(normalizePlan).filter((item): item is NovaAdaptBridgePlan => Boolean(item)))
          : [],
      jobs:
        jobsResult.status === "fulfilled" && Array.isArray(jobsResult.value)
          ? sortNewest(jobsResult.value.map(normalizeJob).filter((item): item is NovaAdaptBridgeJob => Boolean(item)))
          : [],
      workflows:
        workflowsResult.status === "fulfilled" && Array.isArray(workflowsResult.value?.workflows)
          ? sortNewest(
              workflowsResult.value.workflows
                .map(normalizeWorkflow)
                .filter((item): item is NovaAdaptBridgeWorkflow => Boolean(item))
            )
          : [],
      templates:
        templatesResult.status === "fulfilled" && Array.isArray(templatesResult.value?.templates)
          ? sortNewest(
              templatesResult.value.templates
                .map(normalizeTemplate)
                .filter((item): item is NovaAdaptBridgeTemplate => Boolean(item))
            )
          : [],
      galleryTemplates:
        galleryResult.status === "fulfilled" && Array.isArray(galleryResult.value?.templates)
          ? galleryResult.value.templates
              .map(normalizeTemplate)
              .filter((item): item is NovaAdaptBridgeTemplate => Boolean(item))
          : [],
    };
  } catch (nextError) {
    if (isBridgeUnavailableError(nextError)) {
      return {
        supported: false,
        runtimeAvailable: false,
        capabilities: DEFAULT_BRIDGE_CAPABILITIES,
        error: null,
        health: null,
        memoryStatus: null,
        browserStatus: null,
        voiceStatus: null,
        canvasStatus: null,
        mobileStatus: null,
        homeAssistantStatus: null,
        mqttStatus: null,
        controlArtifacts: [],
        governance: null,
        plans: [],
        jobs: [],
        workflows: [],
        templates: [],
        galleryTemplates: [],
      };
    }
    return {
      supported: true,
      runtimeAvailable: false,
      capabilities: DEFAULT_BRIDGE_CAPABILITIES,
      error: nextError instanceof Error ? nextError.message : String(nextError || "Unknown error"),
      health: null,
      memoryStatus: null,
      browserStatus: null,
      voiceStatus: null,
      canvasStatus: null,
      mobileStatus: null,
      homeAssistantStatus: null,
      mqttStatus: null,
      controlArtifacts: [],
      governance: null,
      plans: [],
      jobs: [],
      workflows: [],
      templates: [],
      galleryTemplates: [],
    };
  }
}

async function postNovaAdaptBridgeJson<T>(
  server: ServerProfile | null,
  path: string,
  body?: Record<string, unknown>
): Promise<T | null> {
  if (!hasBridgeCredentials(server)) {
    return null;
  }
  return await apiRequest<T>(server.baseUrl, server.token, path, {
    method: "POST",
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function fetchNovaAdaptBridgeControlArtifact(
  server: ServerProfile | null,
  artifactId: string
): Promise<NovaAdaptBridgeControlArtifactDetail | null> {
  if (!hasBridgeCredentials(server)) {
    return null;
  }
  const normalizedArtifactId = artifactId.trim();
  if (!normalizedArtifactId) {
    return null;
  }
  const response = await apiRequest<unknown>(
    server.baseUrl,
    server.token,
    `/agents/control/artifacts/${encodeURIComponent(normalizedArtifactId)}`
  );
  return normalizeControlArtifactDetail(response);
}

export async function createNovaAdaptBridgePlan(
  server: ServerProfile | null,
  objective: string,
  options?: { strategy?: string }
): Promise<NovaAdaptBridgePlan | null> {
  const normalizedObjective = objective.trim();
  if (!normalizedObjective) {
    return null;
  }
  const payload: Record<string, unknown> = {
    objective: normalizedObjective,
  };
  if (options?.strategy?.trim()) {
    payload.strategy = options.strategy.trim();
  }
  return normalizePlan(await postNovaAdaptBridgeJson<unknown>(server, "/agents/plans", payload));
}

export async function startNovaAdaptBridgeWorkflow(
  server: ServerProfile | null,
  objective: string,
  options?: { metadata?: Record<string, unknown>; autoResume?: boolean }
): Promise<NovaAdaptBridgeWorkflow | null> {
  const normalizedObjective = objective.trim();
  if (!normalizedObjective) {
    return null;
  }
  const metadata =
    options?.metadata && Object.keys(options.metadata).length > 0
      ? { ...options.metadata, created_by: "novaremote_mobile" }
      : { created_by: "novaremote_mobile" };
  const created = normalizeWorkflow(
    await postNovaAdaptBridgeJson<unknown>(server, "/agents/workflows/start", {
      objective: normalizedObjective,
      metadata,
      context: "api",
    })
  );
  if (!created || options?.autoResume === false) {
    return created;
  }
  const resumed = await postNovaAdaptBridgeJson<unknown>(server, "/agents/workflows/resume", {
    workflow_id: created.workflowId,
    context: "api",
  });
  return normalizeWorkflow(resumed) ?? created;
}

export async function importNovaAdaptBridgeTemplate(
  server: ServerProfile | null,
  template: NovaAdaptBridgeTemplate
): Promise<NovaAdaptBridgeTemplate | null> {
  if (!template.templateId.trim() || !template.name.trim() || !template.objective.trim()) {
    return null;
  }
  return normalizeTemplate(
    await postNovaAdaptBridgeJson<unknown>(server, "/agents/templates/import", {
      manifest: {
        template_id: template.templateId,
        name: template.name,
        description: template.description,
        objective: template.objective,
        strategy: template.strategy,
        candidates: template.candidates,
        steps: template.steps.map((step) => ({ name: step.name, objective: step.objective })),
        metadata: template.metadata,
        tags: template.tags,
        source: template.source,
      },
    })
  );
}

export async function launchNovaAdaptBridgeTemplate(
  server: ServerProfile | null,
  templateId: string,
  options?: { mode?: "plan" | "workflow" | "run"; execute?: boolean; allowDangerous?: boolean }
): Promise<boolean> {
  const normalizedTemplateId = templateId.trim();
  if (!normalizedTemplateId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(server, `/agents/templates/${encodeURIComponent(normalizedTemplateId)}/launch`, {
      mode: options?.mode || "plan",
      execute: Boolean(options?.execute),
      allow_dangerous: Boolean(options?.allowDangerous),
      context: "api",
    })
  );
}

export async function resumeNovaAdaptBridgeWorkflow(server: ServerProfile | null, workflowId: string): Promise<boolean> {
  const normalizedWorkflowId = workflowId.trim();
  if (!normalizedWorkflowId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(server, "/agents/workflows/resume", {
      workflow_id: normalizedWorkflowId,
      context: "api",
    })
  );
}

export async function approveNovaAdaptBridgePlanAsync(server: ServerProfile | null, planId: string): Promise<boolean> {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(server, `/agents/plans/${encodeURIComponent(normalizedPlanId)}/approve_async`, {
      execute: true,
    })
  );
}

export async function rejectNovaAdaptBridgePlan(
  server: ServerProfile | null,
  planId: string,
  reason?: string
): Promise<boolean> {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(
      server,
      `/agents/plans/${encodeURIComponent(normalizedPlanId)}/reject`,
      reason?.trim() ? { reason: reason.trim() } : {}
    )
  );
}

export async function retryFailedNovaAdaptBridgePlanAsync(server: ServerProfile | null, planId: string): Promise<boolean> {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(
      server,
      `/agents/plans/${encodeURIComponent(normalizedPlanId)}/retry_failed_async`,
      { execute: true, retry_failed_only: true }
    )
  );
}

export async function undoNovaAdaptBridgePlan(server: ServerProfile | null, planId: string): Promise<boolean> {
  const normalizedPlanId = planId.trim();
  if (!normalizedPlanId) {
    return false;
  }
  return Boolean(
    await postNovaAdaptBridgeJson<unknown>(server, `/agents/plans/${encodeURIComponent(normalizedPlanId)}/undo`, {})
  );
}

export function useNovaAdaptBridge({
  server,
  enabled = true,
  refreshIntervalMs = DEFAULT_REFRESH_INTERVAL_MS,
}: UseNovaAdaptBridgeArgs): UseNovaAdaptBridgeResult {
  const serverReady = Boolean(
    enabled &&
      server &&
      normalizeBaseUrl(server.baseUrl) &&
      server.token.trim()
  );
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [supported, setSupported] = useState<boolean>(false);
  const [runtimeAvailable, setRuntimeAvailable] = useState<boolean>(false);
  const [capabilities, setCapabilities] = useState<NovaAdaptBridgeCapabilities>(DEFAULT_BRIDGE_CAPABILITIES);
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<NovaAdaptBridgeHealth | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<NovaAdaptBridgeMemoryStatus | null>(null);
  const [browserStatus, setBrowserStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [voiceStatus, setVoiceStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [canvasStatus, setCanvasStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [mobileStatus, setMobileStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [homeAssistantStatus, setHomeAssistantStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [mqttStatus, setMqttStatus] = useState<NovaAdaptBridgeSurfaceStatus | null>(null);
  const [controlArtifacts, setControlArtifacts] = useState<NovaAdaptBridgeControlArtifact[]>([]);
  const [governance, setGovernance] = useState<NovaAdaptBridgeGovernance | null>(null);
  const [plans, setPlans] = useState<NovaAdaptBridgePlan[]>([]);
  const [jobs, setJobs] = useState<NovaAdaptBridgeJob[]>([]);
  const [workflows, setWorkflows] = useState<NovaAdaptBridgeWorkflow[]>([]);
  const [templates, setTemplates] = useState<NovaAdaptBridgeTemplate[]>([]);
  const [galleryTemplates, setGalleryTemplates] = useState<NovaAdaptBridgeTemplate[]>([]);
  const activePlanStreamIdsRef = useRef<Set<string>>(new Set());
  const activeJobStreamIdsRef = useRef<Set<string>>(new Set());
  const lastAuditEventIdRef = useRef<number>(0);
  const eventRefreshTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activePlanTargets = useMemo(
    () => plans.filter((plan) => isActivePlanStatus(plan.status)).slice(0, MAX_ACTIVE_PLAN_STREAMS),
    [plans]
  );
  const activeJobTargets = useMemo(
    () => jobs.filter((job) => isActiveJobStatus(job.status)).slice(0, MAX_ACTIVE_JOB_STREAMS),
    [jobs]
  );
  const activePlanStreamKey = useMemo(() => activePlanTargets.map((plan) => plan.id).join("|"), [activePlanTargets]);
  const activeJobStreamKey = useMemo(() => activeJobTargets.map((job) => job.id).join("|"), [activeJobTargets]);

  const refresh = useCallback(
    async (options: RefreshOptions = {}) => {
      if (!serverReady || !server) {
        setLoading(false);
        setRefreshing(false);
        setSupported(false);
        setRuntimeAvailable(false);
        setCapabilities(DEFAULT_BRIDGE_CAPABILITIES);
        setError(null);
        setHealth(null);
        setMemoryStatus(null);
        setBrowserStatus(null);
        setVoiceStatus(null);
        setCanvasStatus(null);
        setMobileStatus(null);
        setHomeAssistantStatus(null);
        setMqttStatus(null);
        setControlArtifacts([]);
        setGovernance(null);
        setPlans([]);
        setJobs([]);
        setWorkflows([]);
        setTemplates([]);
        setGalleryTemplates([]);
        return;
      }

      if (options.quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const snapshot = await fetchNovaAdaptBridgeSnapshot(server);
        setSupported(snapshot.supported);
        setRuntimeAvailable(snapshot.runtimeAvailable);
        setCapabilities(snapshot.capabilities);
        setError(snapshot.error);
        setHealth(snapshot.health);
        setMemoryStatus(snapshot.memoryStatus);
        setBrowserStatus(snapshot.browserStatus);
        setVoiceStatus(snapshot.voiceStatus);
        setCanvasStatus(snapshot.canvasStatus);
        setMobileStatus(snapshot.mobileStatus);
        setHomeAssistantStatus(snapshot.homeAssistantStatus);
        setMqttStatus(snapshot.mqttStatus);
        setControlArtifacts(snapshot.controlArtifacts);
        setGovernance(snapshot.governance);
        setPlans(snapshot.plans);
        setJobs(snapshot.jobs);
        setWorkflows(snapshot.workflows);
        setTemplates(snapshot.templates);
        setGalleryTemplates(snapshot.galleryTemplates);
      } catch (nextError) {
        const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
        setSupported(true);
        setRuntimeAvailable(false);
        setCapabilities(DEFAULT_BRIDGE_CAPABILITIES);
        setError(detail);
        setHealth(null);
        setMemoryStatus(null);
        setBrowserStatus(null);
        setVoiceStatus(null);
        setCanvasStatus(null);
        setMobileStatus(null);
        setHomeAssistantStatus(null);
        setMqttStatus(null);
        setControlArtifacts([]);
        setGovernance(null);
        setPlans([]);
        setJobs([]);
        setWorkflows([]);
        setTemplates([]);
        setGalleryTemplates([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [server, serverReady]
  );

  const scheduleEventRefresh = useCallback(() => {
    if (eventRefreshTimeoutRef.current) {
      return;
    }
    eventRefreshTimeoutRef.current = setTimeout(() => {
      eventRefreshTimeoutRef.current = null;
      void refresh({ quiet: true });
    }, EVENT_REFRESH_DEBOUNCE_MS);
  }, [refresh]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!serverReady) {
      return undefined;
    }
    const interval = setInterval(() => {
      void refresh({ quiet: true });
    }, Math.max(5_000, refreshIntervalMs));
    return () => clearInterval(interval);
  }, [refresh, refreshIntervalMs, serverReady]);

  useEffect(() => {
    if (!serverReady || !server || !supported) {
      lastAuditEventIdRef.current = 0;
      return undefined;
    }

    const controller = new AbortController();
    let closed = false;

    const connect = async () => {
      while (!closed) {
        try {
          const response = await fetch(
            `${normalizeBaseUrl(server.baseUrl)}/agents/events/stream?timeout=${STREAM_TIMEOUT_SECONDS}&interval=${STREAM_INTERVAL_SECONDS}&since_id=${lastAuditEventIdRef.current}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${server.token}`,
                Accept: "text/event-stream",
              },
              signal: controller.signal,
            }
          );
          if (!response.ok || !supportsBodyStreaming(response.body)) {
            return;
          }

          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (!closed) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const next = splitStreamBuffer(buffer);
            buffer = next.remainder;
            extractSseEvents(next.lines).forEach((event) => {
              if (event.event !== "audit") {
                if (event.event === "end" || event.event === "timeout" || event.event === "error") {
                  scheduleEventRefresh();
                }
                return;
              }
              try {
                const parsed = JSON.parse(event.data) as RawBridgeAuditEvent;
                const eventId = asInteger(parsed.id);
                if (eventId > 0) {
                  lastAuditEventIdRef.current = Math.max(lastAuditEventIdRef.current, eventId);
                }
                if (isRelevantBridgeAuditEvent(parsed)) {
                  scheduleEventRefresh();
                }
              } catch {
                // Ignore malformed frames.
              }
            });
          }
        } catch (streamError) {
          if (streamError instanceof Error && streamError.name === "AbortError") {
            return;
          }
          scheduleEventRefresh();
        }

        if (!closed) {
          await new Promise((resolve) => setTimeout(resolve, EVENT_STREAM_RECONNECT_DELAY_MS));
        }
      }
    };

    void connect();

    return () => {
      closed = true;
      controller.abort();
    };
  }, [scheduleEventRefresh, server, serverReady, supported]);

  useEffect(() => {
    if (!serverReady || !server) {
      activePlanStreamIdsRef.current.clear();
      return undefined;
    }
    const activePlanIds = activePlanTargets.map((plan) => plan.id);
    if (sameIdSet(activePlanStreamIdsRef.current, activePlanIds)) {
      return undefined;
    }
    if (activePlanTargets.length === 0) {
      activePlanStreamIdsRef.current.clear();
      return undefined;
    }

    const controllers = new Map<string, AbortController>();
    activePlanStreamIdsRef.current = new Set(activePlanIds);

    activePlanTargets.forEach((plan) => {
      const controller = new AbortController();
      controllers.set(plan.id, controller);

      void (async () => {
        try {
          const response = await fetch(
            `${normalizeBaseUrl(server.baseUrl)}/agents/plans/${encodeURIComponent(plan.id)}/stream?timeout=${STREAM_TIMEOUT_SECONDS}&interval=${STREAM_INTERVAL_SECONDS}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${server.token}`,
                Accept: "text/event-stream",
              },
              signal: controller.signal,
            }
          );
          if (!response.ok || !supportsBodyStreaming(response.body)) {
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const next = splitStreamBuffer(buffer);
            buffer = next.remainder;
            extractSseEvents(next.lines).forEach((event) => {
              if (event.event !== "plan") {
                if (event.event === "end" || event.event === "timeout" || event.event === "error") {
                  void refresh({ quiet: true });
                }
                return;
              }
              try {
                const parsed = normalizePlan(JSON.parse(event.data));
                if (parsed) {
                  setPlans((current) => upsertById(current, parsed));
                }
              } catch {
                // Ignore malformed stream frames.
              }
            });
          }
        } catch (streamError) {
          if (!(streamError instanceof Error) || streamError.name !== "AbortError") {
            void refresh({ quiet: true });
          }
        }
      })();
    });

    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, [activePlanStreamKey, refresh, server, serverReady]);

  useEffect(() => {
    if (!serverReady || !server) {
      activeJobStreamIdsRef.current.clear();
      return undefined;
    }
    const activeJobIds = activeJobTargets.map((job) => job.id);
    if (sameIdSet(activeJobStreamIdsRef.current, activeJobIds)) {
      return undefined;
    }
    if (activeJobTargets.length === 0) {
      activeJobStreamIdsRef.current.clear();
      return undefined;
    }

    const controllers = new Map<string, AbortController>();
    activeJobStreamIdsRef.current = new Set(activeJobIds);

    activeJobTargets.forEach((job) => {
      const controller = new AbortController();
      controllers.set(job.id, controller);

      void (async () => {
        try {
          const response = await fetch(
            `${normalizeBaseUrl(server.baseUrl)}/agents/jobs/${encodeURIComponent(job.id)}/stream?timeout=${STREAM_TIMEOUT_SECONDS}&interval=${STREAM_INTERVAL_SECONDS}`,
            {
              method: "GET",
              headers: {
                Authorization: `Bearer ${server.token}`,
                Accept: "text/event-stream",
              },
              signal: controller.signal,
            }
          );
          if (!response.ok || !supportsBodyStreaming(response.body)) {
            return;
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder("utf-8");
          let buffer = "";

          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              break;
            }
            buffer += decoder.decode(value, { stream: true });
            const next = splitStreamBuffer(buffer);
            buffer = next.remainder;
            extractSseEvents(next.lines).forEach((event) => {
              if (event.event !== "job") {
                if (event.event === "end" || event.event === "timeout" || event.event === "error") {
                  void refresh({ quiet: true });
                }
                return;
              }
              try {
                const parsed = normalizeJob(JSON.parse(event.data));
                if (parsed) {
                  setJobs((current) => upsertById(current, parsed));
                }
              } catch {
                // Ignore malformed stream frames.
              }
            });
          }
        } catch (streamError) {
          if (!(streamError instanceof Error) || streamError.name !== "AbortError") {
            void refresh({ quiet: true });
          }
        }
      })();
    });

    return () => {
      controllers.forEach((controller) => controller.abort());
    };
  }, [activeJobStreamKey, refresh, server, serverReady]);

  useEffect(
    () => () => {
      if (eventRefreshTimeoutRef.current) {
        clearTimeout(eventRefreshTimeoutRef.current);
        eventRefreshTimeoutRef.current = null;
      }
    },
    []
  );

  const createPlan = useCallback(
    async (objective: string, options?: { strategy?: string }): Promise<NovaAdaptBridgePlan | null> => {
      const result = await createNovaAdaptBridgePlan(server, objective, options);
      await refresh({ quiet: true });
      return result;
    },
    [refresh, server]
  );

  const resumeWorkflow = useCallback(
    async (workflowId: string): Promise<boolean> => {
      if (!capabilities.workflows) {
        return false;
      }
      const ok = await resumeNovaAdaptBridgeWorkflow(server, workflowId);
      await refresh({ quiet: true });
      return ok;
    },
    [capabilities.workflows, refresh, server]
  );

  const startWorkflow = useCallback(
    async (
      objective: string,
      options?: { metadata?: Record<string, unknown>; autoResume?: boolean }
    ): Promise<NovaAdaptBridgeWorkflow | null> => {
      if (!capabilities.workflows) {
        return null;
      }
      const result = await startNovaAdaptBridgeWorkflow(server, objective, options);
      await refresh({ quiet: true });
      return result;
    },
    [capabilities.workflows, refresh, server]
  );

  const importTemplate = useCallback(
    async (template: NovaAdaptBridgeTemplate): Promise<NovaAdaptBridgeTemplate | null> => {
      if (!capabilities.templates && !capabilities.templateGallery) {
        return null;
      }
      const result = await importNovaAdaptBridgeTemplate(server, template);
      if (result) {
        setTemplates((current) =>
          sortNewest([result, ...current.filter((item) => item.templateId !== result.templateId)]).slice(0, 24)
        );
      }
      return result;
    },
    [capabilities.templateGallery, capabilities.templates, server]
  );

  const launchTemplate = useCallback(
    async (
      templateId: string,
      options?: { mode?: "plan" | "workflow" | "run"; execute?: boolean; allowDangerous?: boolean }
    ): Promise<boolean> => {
      if (!capabilities.templates && !capabilities.templateGallery) {
        return false;
      }
      const ok = await launchNovaAdaptBridgeTemplate(server, templateId, options);
      await refresh({ quiet: true });
      return ok;
    },
    [capabilities.templateGallery, capabilities.templates, refresh, server]
  );

  const approvePlanAsync = useCallback(
    async (planId: string) => {
      const ok = await approveNovaAdaptBridgePlanAsync(server, planId);
      await refresh({ quiet: true });
      return ok;
    },
    [refresh, server]
  );

  const rejectPlan = useCallback(
    async (planId: string, reason?: string) => {
      const ok = await rejectNovaAdaptBridgePlan(server, planId, reason);
      await refresh({ quiet: true });
      return ok;
    },
    [refresh, server]
  );

  const retryFailedPlanAsync = useCallback(
    async (planId: string) => {
      const ok = await retryFailedNovaAdaptBridgePlanAsync(server, planId);
      await refresh({ quiet: true });
      return ok;
    },
    [refresh, server]
  );

  const undoPlan = useCallback(
    async (planId: string) => {
      const ok = await undoNovaAdaptBridgePlan(server, planId);
      await refresh({ quiet: true });
      return ok;
    },
    [refresh, server]
  );

  const pauseRuntime = useCallback(
    async (reason?: string) => {
      if (!capabilities.governance) {
        return false;
      }
      const result = normalizeGovernance(
        await postNovaAdaptBridgeJson<unknown>(server, "/agents/runtime/governance", {
          paused: true,
          pause_reason: reason?.trim() || "Paused from NovaRemote mobile",
        })
      );
      await refresh({ quiet: true });
      return Boolean(result);
    },
    [capabilities.governance, refresh, server]
  );

  const resumeRuntime = useCallback(
    async () => {
      if (!capabilities.governance) {
        return false;
      }
      const result = normalizeGovernance(
        await postNovaAdaptBridgeJson<unknown>(server, "/agents/runtime/governance", {
          paused: false,
          pause_reason: "",
        })
      );
      await refresh({ quiet: true });
      return Boolean(result);
    },
    [capabilities.governance, refresh, server]
  );

  const resetGovernanceUsage = useCallback(
    async () => {
      if (!capabilities.governance) {
        return false;
      }
      const result = normalizeGovernance(
        await postNovaAdaptBridgeJson<unknown>(server, "/agents/runtime/governance", {
          reset_usage: true,
        })
      );
      await refresh({ quiet: true });
      return Boolean(result);
    },
    [capabilities.governance, refresh, server]
  );

  const cancelAllJobs = useCallback(
    async (reason?: string) => {
      if (!capabilities.governance) {
        return false;
      }
      const result = await postNovaAdaptBridgeJson<unknown>(server, "/agents/runtime/jobs/cancel_all", {
        pause: true,
        pause_reason: reason?.trim() || "Canceled from NovaRemote mobile",
      });
      await refresh({ quiet: true });
      return Boolean(result);
    },
    [capabilities.governance, refresh, server]
  );

  const loadControlArtifact = useCallback(
    async (artifactId: string) => {
      try {
        return await fetchNovaAdaptBridgeControlArtifact(server, artifactId);
      } catch (nextError) {
        if (isMissingRouteError(nextError) || isBridgeUnavailableError(nextError)) {
          return null;
        }
        throw nextError;
      }
    },
    [server]
  );

  return useMemo(
    () => ({
      loading,
      refreshing,
      supported,
      runtimeAvailable,
      capabilities,
      error,
      health,
      memoryStatus,
      browserStatus,
      voiceStatus,
      canvasStatus,
      mobileStatus,
      homeAssistantStatus,
      mqttStatus,
      controlArtifacts,
      governance,
      plans,
      jobs,
      workflows,
      templates,
      galleryTemplates,
      loadControlArtifact,
      refresh,
      createPlan,
      startWorkflow,
      importTemplate,
      launchTemplate,
      resumeWorkflow,
      approvePlanAsync,
      rejectPlan,
      retryFailedPlanAsync,
      undoPlan,
      pauseRuntime,
      resumeRuntime,
      resetGovernanceUsage,
      cancelAllJobs,
    }),
    [
      approvePlanAsync,
      cancelAllJobs,
      createPlan,
      error,
      governance,
      health,
      homeAssistantStatus,
      jobs,
      loading,
      loadControlArtifact,
      galleryTemplates,
      capabilities,
      browserStatus,
      canvasStatus,
      controlArtifacts,
      memoryStatus,
      mobileStatus,
      mqttStatus,
      plans,
      refresh,
      refreshing,
      rejectPlan,
      resetGovernanceUsage,
      resumeWorkflow,
      resumeRuntime,
      retryFailedPlanAsync,
      runtimeAvailable,
      startWorkflow,
      supported,
      templates,
      undoPlan,
      pauseRuntime,
      voiceStatus,
      workflows,
      importTemplate,
      launchTemplate,
    ]
  );
}

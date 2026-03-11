import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest, normalizeBaseUrl } from "../api/client";
import {
  NovaAdaptBridgeHealth,
  NovaAdaptBridgeJob,
  NovaAdaptBridgeMemoryStatus,
  NovaAdaptBridgePlan,
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
  error: string | null;
  health: NovaAdaptBridgeHealth | null;
  memoryStatus: NovaAdaptBridgeMemoryStatus | null;
  plans: NovaAdaptBridgePlan[];
  jobs: NovaAdaptBridgeJob[];
  workflows: NovaAdaptBridgeWorkflow[];
  refresh: (options?: RefreshOptions) => Promise<void>;
  createPlan: (objective: string, options?: { strategy?: string }) => Promise<NovaAdaptBridgePlan | null>;
  startWorkflow: (
    objective: string,
    options?: { metadata?: Record<string, unknown>; autoResume?: boolean }
  ) => Promise<NovaAdaptBridgeWorkflow | null>;
  resumeWorkflow: (workflowId: string) => Promise<boolean>;
  approvePlanAsync: (planId: string) => Promise<boolean>;
  rejectPlan: (planId: string, reason?: string) => Promise<boolean>;
  retryFailedPlanAsync: (planId: string) => Promise<boolean>;
  undoPlan: (planId: string) => Promise<boolean>;
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
  updated_at?: unknown;
  last_error?: unknown;
};

type RawWorkflowsResponse = {
  workflows?: unknown;
};

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
const STREAM_TIMEOUT_SECONDS = 300;
const STREAM_INTERVAL_SECONDS = 0.25;
const MAX_ACTIVE_PLAN_STREAMS = 3;
const MAX_ACTIVE_JOB_STREAMS = 3;

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

function isBridgeUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error || "").toLowerCase();
  return (
    message.includes("404") ||
    message.includes("503") ||
    message.includes("novaadapt bridge is not configured") ||
    message.includes("upstream unavailable")
  );
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
    updatedAt: asNullableString(raw?.updated_at),
    lastError: asNullableString(raw?.last_error),
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
  const [error, setError] = useState<string | null>(null);
  const [health, setHealth] = useState<NovaAdaptBridgeHealth | null>(null);
  const [memoryStatus, setMemoryStatus] = useState<NovaAdaptBridgeMemoryStatus | null>(null);
  const [plans, setPlans] = useState<NovaAdaptBridgePlan[]>([]);
  const [jobs, setJobs] = useState<NovaAdaptBridgeJob[]>([]);
  const [workflows, setWorkflows] = useState<NovaAdaptBridgeWorkflow[]>([]);
  const activePlanStreamIdsRef = useRef<Set<string>>(new Set());
  const activeJobStreamIdsRef = useRef<Set<string>>(new Set());
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
        setError(null);
        setHealth(null);
        setMemoryStatus(null);
        setPlans([]);
        setJobs([]);
        setWorkflows([]);
        return;
      }

      if (options.quiet) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const nextHealth = await apiRequest<NovaAdaptBridgeHealth>(server.baseUrl, server.token, "/agents/health?deep=1");
        const [plansResult, jobsResult, memoryResult, workflowsResult] = await Promise.allSettled([
          apiRequest<unknown>(server.baseUrl, server.token, "/agents/plans?limit=12"),
          apiRequest<unknown>(server.baseUrl, server.token, "/agents/jobs?limit=12"),
          apiRequest<NovaAdaptBridgeMemoryStatus>(server.baseUrl, server.token, "/agents/memory/status"),
          apiRequest<RawWorkflowsResponse>(server.baseUrl, server.token, "/agents/workflows/list?limit=12&context=api"),
        ]);

        const nextPlans =
          plansResult.status === "fulfilled" && Array.isArray(plansResult.value)
            ? sortNewest(plansResult.value.map(normalizePlan).filter((item): item is NovaAdaptBridgePlan => Boolean(item)))
            : [];
        const nextJobs =
          jobsResult.status === "fulfilled" && Array.isArray(jobsResult.value)
            ? sortNewest(jobsResult.value.map(normalizeJob).filter((item): item is NovaAdaptBridgeJob => Boolean(item)))
            : [];
        const nextWorkflows =
          workflowsResult.status === "fulfilled" && Array.isArray(workflowsResult.value?.workflows)
            ? sortNewest(
                workflowsResult.value.workflows
                  .map(normalizeWorkflow)
                  .filter((item): item is NovaAdaptBridgeWorkflow => Boolean(item))
              )
            : [];

        setSupported(true);
        setRuntimeAvailable(Boolean(nextHealth.ok));
        setError(null);
        setHealth(nextHealth);
        setMemoryStatus(memoryResult.status === "fulfilled" ? memoryResult.value : null);
        setPlans(nextPlans);
        setJobs(nextJobs);
        setWorkflows(nextWorkflows);
      } catch (nextError) {
        if (isBridgeUnavailableError(nextError)) {
          setSupported(false);
          setRuntimeAvailable(false);
          setError(null);
          setHealth(null);
          setMemoryStatus(null);
          setPlans([]);
          setJobs([]);
          setWorkflows([]);
        } else {
          const detail = nextError instanceof Error ? nextError.message : String(nextError || "Unknown error");
          setSupported(true);
          setRuntimeAvailable(false);
          setError(detail);
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [server, serverReady]
  );

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

  const runPlanMutation = useCallback(
    async (path: string, body?: Record<string, unknown>): Promise<boolean> => {
      if (!serverReady || !server) {
        return false;
      }
      await apiRequest<unknown>(server.baseUrl, server.token, path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh({ quiet: true });
      return true;
    },
    [refresh, server, serverReady]
  );

  const runJsonMutation = useCallback(
    async <T,>(path: string, body?: Record<string, unknown>): Promise<T | null> => {
      if (!serverReady || !server) {
        return null;
      }
      const result = await apiRequest<T>(server.baseUrl, server.token, path, {
        method: "POST",
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh({ quiet: true });
      return result;
    },
    [refresh, server, serverReady]
  );

  const createPlan = useCallback(
    async (objective: string, options?: { strategy?: string }): Promise<NovaAdaptBridgePlan | null> => {
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
      const result = await runJsonMutation<unknown>("/agents/plans", payload);
      return normalizePlan(result);
    },
    [runJsonMutation]
  );

  const resumeWorkflow = useCallback(
    async (workflowId: string): Promise<boolean> => {
      const normalizedWorkflowId = workflowId.trim();
      if (!normalizedWorkflowId) {
        return false;
      }
      return Boolean(
        await runJsonMutation<unknown>("/agents/workflows/resume", {
          workflow_id: normalizedWorkflowId,
          context: "api",
        })
      );
    },
    [runJsonMutation]
  );

  const startWorkflow = useCallback(
    async (
      objective: string,
      options?: { metadata?: Record<string, unknown>; autoResume?: boolean }
    ): Promise<NovaAdaptBridgeWorkflow | null> => {
      const normalizedObjective = objective.trim();
      if (!normalizedObjective) {
        return null;
      }
      const metadata =
        options?.metadata && Object.keys(options.metadata).length > 0
          ? { ...options.metadata, created_by: "novaremote_mobile" }
          : { created_by: "novaremote_mobile" };
      const created = await runJsonMutation<unknown>("/agents/workflows/start", {
        objective: normalizedObjective,
        metadata,
        context: "api",
      });
      const normalized = normalizeWorkflow(created);
      if (!normalized) {
        return null;
      }
      if (options?.autoResume === false) {
        return normalized;
      }
      const resumed = await runJsonMutation<unknown>("/agents/workflows/resume", {
        workflow_id: normalized.workflowId,
        context: "api",
      });
      return normalizeWorkflow(resumed) ?? normalized;
    },
    [runJsonMutation]
  );

  const approvePlanAsync = useCallback(
    async (planId: string) => runPlanMutation(`/agents/plans/${encodeURIComponent(planId)}/approve_async`, { execute: true }),
    [runPlanMutation]
  );

  const rejectPlan = useCallback(
    async (planId: string, reason?: string) =>
      runPlanMutation(`/agents/plans/${encodeURIComponent(planId)}/reject`, reason?.trim() ? { reason: reason.trim() } : {}),
    [runPlanMutation]
  );

  const retryFailedPlanAsync = useCallback(
    async (planId: string) =>
      runPlanMutation(`/agents/plans/${encodeURIComponent(planId)}/retry_failed_async`, { execute: true, retry_failed_only: true }),
    [runPlanMutation]
  );

  const undoPlan = useCallback(
    async (planId: string) => runPlanMutation(`/agents/plans/${encodeURIComponent(planId)}/undo`, {}),
    [runPlanMutation]
  );

  return useMemo(
    () => ({
      loading,
      refreshing,
      supported,
      runtimeAvailable,
      error,
      health,
      memoryStatus,
      plans,
      jobs,
      workflows,
      refresh,
      createPlan,
      startWorkflow,
      resumeWorkflow,
      approvePlanAsync,
      rejectPlan,
      retryFailedPlanAsync,
      undoPlan,
    }),
    [
      approvePlanAsync,
      createPlan,
      error,
      health,
      jobs,
      loading,
      memoryStatus,
      plans,
      refresh,
      refreshing,
      rejectPlan,
      resumeWorkflow,
      retryFailedPlanAsync,
      runtimeAvailable,
      startWorkflow,
      supported,
      undoPlan,
      workflows,
    ]
  );
}

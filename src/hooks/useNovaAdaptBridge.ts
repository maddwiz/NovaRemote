import { useCallback, useEffect, useMemo, useState } from "react";

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
      approvePlanAsync,
      rejectPlan,
      retryFailedPlanAsync,
      undoPlan,
    }),
    [
      approvePlanAsync,
      error,
      health,
      jobs,
      loading,
      memoryStatus,
      plans,
      refresh,
      refreshing,
      rejectPlan,
      retryFailedPlanAsync,
      runtimeAvailable,
      supported,
      undoPlan,
      workflows,
    ]
  );
}

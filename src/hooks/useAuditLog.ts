import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { cloudRequest, getNovaCloudUrl } from "../api/cloudClient";
import {
  STORAGE_AUDIT_DEVICE_ID,
  STORAGE_AUDIT_LOG_QUEUE,
  TEAM_AUDIT_QUEUE_LIMIT,
  TEAM_AUDIT_SYNC_INTERVAL_MS,
  makeId,
} from "../constants";
import { AuditAction, AuditEvent, TeamAuditExportJob, TeamIdentity } from "../types";

type UseAuditLogArgs = {
  identity: TeamIdentity | null;
  enabled?: boolean;
  syncEnabled?: boolean;
  cloudUrl?: string;
  fetchImpl?: typeof fetch;
  appVersion?: string;
  onError?: (error: unknown) => void;
};

type AuditRecordInput = {
  action: AuditAction;
  serverId?: string;
  serverName?: string;
  session?: string;
  detail?: string;
  approved?: boolean | null;
};

type AuditRecordOptions = {
  immediateSync?: boolean;
};

type AuditSyncResponse = {
  accepted?: unknown;
} & Record<string, unknown>;

type AuditExportFormat = "json" | "csv";

function normalizeAuditEvent(value: unknown): AuditEvent | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<AuditEvent>;
  const id = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : "";
  const timestamp = typeof parsed.timestamp === "number" && Number.isFinite(parsed.timestamp) ? parsed.timestamp : 0;
  const action = typeof parsed.action === "string" ? parsed.action : "";
  if (!id || !timestamp || !action) {
    return null;
  }
  return {
    id,
    timestamp,
    action: action as AuditAction,
    userId: typeof parsed.userId === "string" ? parsed.userId : "local-user",
    userEmail: typeof parsed.userEmail === "string" ? parsed.userEmail : "local@device",
    serverId: typeof parsed.serverId === "string" ? parsed.serverId : "",
    serverName: typeof parsed.serverName === "string" ? parsed.serverName : "",
    session: typeof parsed.session === "string" ? parsed.session : "",
    detail: typeof parsed.detail === "string" ? parsed.detail : "",
    approved: typeof parsed.approved === "boolean" ? parsed.approved : null,
    deviceId: typeof parsed.deviceId === "string" ? parsed.deviceId : "unknown-device",
    appVersion: typeof parsed.appVersion === "string" ? parsed.appVersion : "unknown",
  };
}

function normalizeAuditQueue(value: unknown): AuditEvent[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((entry) => normalizeAuditEvent(entry)).filter((entry): entry is AuditEvent => Boolean(entry));
}

function formatAuditTimestamp(timestamp: number): string {
  if (!Number.isFinite(timestamp) || timestamp <= 0) {
    return "";
  }
  return new Date(timestamp).toISOString();
}

function escapeCsvCell(value: unknown): string {
  const text = String(value ?? "");
  if (!text) {
    return "";
  }
  if (!/[",\n\r]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
}

function normalizeAuditExportJob(value: unknown): TeamAuditExportJob | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Record<string, unknown>;
  const exportId =
    (typeof parsed.exportId === "string" && parsed.exportId.trim()) ||
    (typeof parsed.id === "string" && parsed.id.trim()) ||
    "";
  const formatRaw = typeof parsed.format === "string" ? parsed.format.trim().toLowerCase() : "";
  const format = formatRaw === "csv" ? "csv" : formatRaw === "json" ? "json" : null;
  const statusRaw = typeof parsed.status === "string" ? parsed.status.trim().toLowerCase() : "";
  const status = statusRaw === "ready" || statusRaw === "failed" || statusRaw === "pending" ? statusRaw : "pending";
  const createdAt =
    (typeof parsed.createdAt === "string" && parsed.createdAt) ||
    (typeof parsed.created_at === "string" && parsed.created_at) ||
    "";
  if (!exportId || !format || !createdAt) {
    return null;
  }
  return {
    exportId,
    format,
    status,
    createdAt,
    readyAt:
      (typeof parsed.readyAt === "string" && parsed.readyAt) ||
      (typeof parsed.ready_at === "string" && parsed.ready_at) ||
      undefined,
    failedAt:
      (typeof parsed.failedAt === "string" && parsed.failedAt) ||
      (typeof parsed.failed_at === "string" && parsed.failed_at) ||
      undefined,
    lastTransitionAt:
      (typeof parsed.lastTransitionAt === "string" && parsed.lastTransitionAt) ||
      (typeof parsed.last_transition_at === "string" && parsed.last_transition_at) ||
      undefined,
    attemptCount:
      typeof parsed.attemptCount === "number" && Number.isFinite(parsed.attemptCount)
        ? Math.max(0, Math.round(parsed.attemptCount))
        : typeof parsed.attempt_count === "number" && Number.isFinite(parsed.attempt_count)
          ? Math.max(0, Math.round(parsed.attempt_count))
          : undefined,
    requestedByUserId:
      (typeof parsed.requestedByUserId === "string" && parsed.requestedByUserId) ||
      (typeof parsed.requested_by_user_id === "string" && parsed.requested_by_user_id) ||
      undefined,
    requestedByEmail:
      (typeof parsed.requestedByEmail === "string" && parsed.requestedByEmail) ||
      (typeof parsed.requested_by_email === "string" && parsed.requested_by_email) ||
      undefined,
    rangeHours:
      typeof parsed.rangeHours === "number" && Number.isFinite(parsed.rangeHours)
        ? Math.max(1, Math.round(parsed.rangeHours))
        : typeof parsed.range_hours === "number" && Number.isFinite(parsed.range_hours)
          ? Math.max(1, Math.round(parsed.range_hours))
          : undefined,
    eventCount:
      typeof parsed.eventCount === "number" && Number.isFinite(parsed.eventCount)
        ? Math.max(0, Math.round(parsed.eventCount))
        : typeof parsed.event_count === "number" && Number.isFinite(parsed.event_count)
          ? Math.max(0, Math.round(parsed.event_count))
          : undefined,
    expiresAt:
      (typeof parsed.expiresAt === "string" && parsed.expiresAt) ||
      (typeof parsed.expires_at === "string" && parsed.expires_at) ||
      undefined,
    downloadUrl:
      (typeof parsed.downloadUrl === "string" && parsed.downloadUrl) ||
      (typeof parsed.download_url === "string" && parsed.download_url) ||
      undefined,
    detail: typeof parsed.detail === "string" ? parsed.detail : undefined,
  };
}

function normalizeAuditExportJobs(value: unknown): TeamAuditExportJob[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const byId = new Map<string, TeamAuditExportJob>();
  value.forEach((entry) => {
    const normalized = normalizeAuditExportJob(entry);
    if (normalized) {
      byId.set(normalized.exportId, normalized);
    }
  });
  return Array.from(byId.values()).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function serializeAuditEvents(events: AuditEvent[], format: AuditExportFormat): string {
  if (format === "json") {
    return JSON.stringify(events, null, 2);
  }

  const headers = [
    "id",
    "timestamp_iso",
    "timestamp_ms",
    "action",
    "user_id",
    "user_email",
    "server_id",
    "server_name",
    "session",
    "detail",
    "approved",
    "device_id",
    "app_version",
  ];
  const rows = events.map((event) => [
    event.id,
    formatAuditTimestamp(event.timestamp),
    event.timestamp,
    event.action,
    event.userId,
    event.userEmail,
    event.serverId,
    event.serverName,
    event.session,
    event.detail,
    event.approved === null ? "" : event.approved ? "true" : "false",
    event.deviceId,
    event.appVersion,
  ]);

  return [headers, ...rows].map((row) => row.map((cell) => escapeCsvCell(cell)).join(",")).join("\n");
}

export function pruneAuditEvents(events: AuditEvent[], limit: number): AuditEvent[] {
  if (events.length <= limit) {
    return events;
  }
  return events.slice(events.length - limit);
}

export function buildAuditEvent(
  input: AuditRecordInput,
  identity: TeamIdentity | null,
  deviceId: string,
  appVersion: string
): AuditEvent {
  return {
    id: makeId(),
    timestamp: Date.now(),
    userId: identity?.userId || "local-user",
    userEmail: identity?.email || "local@device",
    serverId: input.serverId || "",
    serverName: input.serverName || "",
    session: input.session || "",
    action: input.action,
    detail: input.detail || "",
    approved: typeof input.approved === "boolean" ? input.approved : null,
    deviceId,
    appVersion,
  };
}

export function useAuditLog({
  identity,
  enabled = true,
  syncEnabled = true,
  cloudUrl,
  fetchImpl,
  appVersion = "1.1.0",
  onError,
}: UseAuditLogArgs) {
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [deviceId, setDeviceId] = useState<string>("unknown-device");
  const [lastError, setLastError] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [lastCloudExportJob, setLastCloudExportJob] = useState<TeamAuditExportJob | null>(null);
  const [cloudExportJobs, setCloudExportJobs] = useState<TeamAuditExportJob[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (!enabled) {
        if (mounted) {
          setEvents([]);
          setLoading(false);
        }
        return;
      }
      try {
        const [rawQueue, rawDeviceId] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_AUDIT_LOG_QUEUE),
          SecureStore.getItemAsync(STORAGE_AUDIT_DEVICE_ID),
        ]);
        if (!mounted) {
          return;
        }
        if (rawQueue) {
          try {
            setEvents(normalizeAuditQueue(JSON.parse(rawQueue) as unknown));
          } catch {
            setEvents([]);
          }
        } else {
          setEvents([]);
        }

        const normalizedDeviceId = rawDeviceId?.trim() || `device-${makeId()}`;
        setDeviceId(normalizedDeviceId);
        if (!rawDeviceId) {
          await SecureStore.setItemAsync(STORAGE_AUDIT_DEVICE_ID, normalizedDeviceId);
        }
      } catch (error) {
        if (mounted) {
          setLastError(error instanceof Error ? error.message : String(error));
          onError?.(error);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }
    void load();
    return () => {
      mounted = false;
    };
  }, [enabled, onError]);

  useEffect(() => {
    if (loading) {
      return;
    }
    void SecureStore.setItemAsync(STORAGE_AUDIT_LOG_QUEUE, JSON.stringify(events)).catch(() => {});
  }, [events, loading]);

  const sendSnapshot = useCallback(
    async (snapshot: AuditEvent[]) => {
      if (!identity?.accessToken || snapshot.length === 0) {
        return;
      }
      await cloudRequest<AuditSyncResponse>(
        "/v1/audit/events",
        {
          method: "POST",
          body: JSON.stringify({
            teamId: identity.teamId,
            events: snapshot,
          }),
        },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
    },
    [cloudUrl, fetchImpl, identity]
  );

  const enqueueEvent = useCallback((event: AuditEvent) => {
    setEvents((prev) => pruneAuditEvents([...prev, event], TEAM_AUDIT_QUEUE_LIMIT));
  }, []);

  const record = useCallback(
    (input: AuditRecordInput, options: AuditRecordOptions = {}) => {
      if (!enabled) {
        return null;
      }
      const event = buildAuditEvent(input, identity, deviceId, appVersion);
      if (options.immediateSync && syncEnabled && identity?.accessToken) {
        setLastError(null);
        void sendSnapshot([event])
          .then(() => {
            setLastSyncAt(Date.now());
          })
          .catch((error) => {
            setLastError(error instanceof Error ? error.message : String(error));
            onError?.(error);
            enqueueEvent(event);
          });
        return event;
      }
      enqueueEvent(event);
      return event;
    },
    [appVersion, deviceId, enabled, enqueueEvent, identity, onError, sendSnapshot, syncEnabled]
  );

  const clear = useCallback(async () => {
    setEvents([]);
    await SecureStore.deleteItemAsync(STORAGE_AUDIT_LOG_QUEUE);
  }, []);

  const syncNow = useCallback(async (): Promise<{ synced: number; remaining: number }> => {
    if (!enabled || !syncEnabled) {
      return { synced: 0, remaining: events.length };
    }
    if (!identity?.accessToken) {
      return { synced: 0, remaining: events.length };
    }
    if (events.length === 0) {
      return { synced: 0, remaining: 0 };
    }

    setSyncing(true);
    setLastError(null);
    try {
      const snapshot = events.slice();
      await sendSnapshot(snapshot);

      setEvents((prev) => {
        const sentIds = new Set(snapshot.map((event) => event.id));
        return prev.filter((event) => !sentIds.has(event.id));
      });
      const now = Date.now();
      setLastSyncAt(now);
      return { synced: snapshot.length, remaining: 0 };
    } catch (error) {
      setLastError(error instanceof Error ? error.message : String(error));
      onError?.(error);
      throw error;
    } finally {
      setSyncing(false);
    }
  }, [enabled, events, identity?.accessToken, onError, sendSnapshot, syncEnabled]);

  const exportSnapshot = useCallback(
    (format: AuditExportFormat = "json") => {
      return serializeAuditEvents(events, format);
    },
    [events]
  );

  const requestCloudExport = useCallback(
    async (format: AuditExportFormat, rangeHours?: number): Promise<TeamAuditExportJob> => {
      if (!enabled || !syncEnabled) {
        throw new Error("Cloud audit export is disabled.");
      }
      if (!identity?.accessToken) {
        throw new Error("Sign in to a team account before requesting cloud audit exports.");
      }
      const normalizedRangeHours =
        typeof rangeHours === "number" && Number.isFinite(rangeHours) && rangeHours > 0
          ? Math.round(rangeHours)
          : undefined;
      const payload = await cloudRequest<Record<string, unknown>>(
        "/v1/audit/exports",
        {
          method: "POST",
          body: JSON.stringify({
            format,
            rangeHours: normalizedRangeHours,
          }),
        },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
      const job = normalizeAuditExportJob(payload.export || payload);
      if (!job) {
        throw new Error("Cloud export response is invalid.");
      }
      setLastCloudExportJob(job);
      setCloudExportJobs((previous) => normalizeAuditExportJobs([job, ...previous]));
      return job;
    },
    [cloudUrl, enabled, fetchImpl, identity, syncEnabled]
  );

  const refreshCloudExports = useCallback(
    async (limit = 20): Promise<TeamAuditExportJob[]> => {
      if (!enabled || !syncEnabled) {
        return [];
      }
      if (!identity?.accessToken) {
        return [];
      }
      const normalizedLimit = Number.isFinite(limit) && limit > 0 ? Math.round(limit) : 20;
      const payload = await cloudRequest<Record<string, unknown>>(
        `/v1/audit/exports?limit=${encodeURIComponent(String(normalizedLimit))}`,
        { method: "GET" },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
      const jobs = normalizeAuditExportJobs(payload.exports || payload.jobs || payload.items || payload);
      setCloudExportJobs(jobs);
      if (jobs.length > 0) {
        setLastCloudExportJob(jobs[0] || null);
      }
      return jobs;
    },
    [cloudUrl, enabled, fetchImpl, identity?.accessToken, syncEnabled]
  );

  const retryCloudExport = useCallback(
    async (exportId: string): Promise<TeamAuditExportJob> => {
      if (!enabled || !syncEnabled) {
        throw new Error("Cloud audit export is disabled.");
      }
      if (!identity?.accessToken) {
        throw new Error("Sign in to a team account before retrying cloud audit exports.");
      }
      const normalizedExportId = exportId.trim();
      if (!normalizedExportId) {
        throw new Error("Export ID is required.");
      }
      const payload = await cloudRequest<Record<string, unknown>>(
        `/v1/audit/exports/${encodeURIComponent(normalizedExportId)}/retry`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
      const job = normalizeAuditExportJob(payload.export || payload);
      if (!job) {
        throw new Error("Cloud export retry response is invalid.");
      }
      setLastCloudExportJob(job);
      setCloudExportJobs((previous) => normalizeAuditExportJobs([job, ...previous]));
      return job;
    },
    [cloudUrl, enabled, fetchImpl, identity, syncEnabled]
  );

  const deleteCloudExport = useCallback(
    async (exportId: string): Promise<TeamAuditExportJob | null> => {
      if (!enabled || !syncEnabled) {
        throw new Error("Cloud audit export is disabled.");
      }
      if (!identity?.accessToken) {
        throw new Error("Sign in to a team account before deleting cloud audit exports.");
      }
      const normalizedExportId = exportId.trim();
      if (!normalizedExportId) {
        throw new Error("Export ID is required.");
      }
      const payload = await cloudRequest<Record<string, unknown>>(
        `/v1/audit/exports/${encodeURIComponent(normalizedExportId)}`,
        {
          method: "DELETE",
        },
        {
          accessToken: identity.accessToken,
          cloudUrl: cloudUrl || getNovaCloudUrl(),
          fetchImpl,
        }
      );
      const removed = normalizeAuditExportJob(payload.export || payload.job || payload);
      setCloudExportJobs((previous) => {
        const next = previous.filter((entry) => entry.exportId !== normalizedExportId);
        setLastCloudExportJob((current) => {
          if (!current) {
            return next[0] || null;
          }
          if (current.exportId === normalizedExportId) {
            return next[0] || null;
          }
          return next.some((entry) => entry.exportId === current.exportId) ? current : next[0] || null;
        });
        return next;
      });
      return removed;
    },
    [cloudUrl, enabled, fetchImpl, identity, syncEnabled]
  );

  useEffect(() => {
    if (!enabled || !syncEnabled || !identity?.accessToken) {
      setCloudExportJobs([]);
      setLastCloudExportJob(null);
      return;
    }
    void refreshCloudExports().catch(() => {});
  }, [enabled, identity?.accessToken, refreshCloudExports, syncEnabled]);

  useEffect(() => {
    if (!enabled || !syncEnabled || !identity?.accessToken) {
      return;
    }
    const timer = setInterval(() => {
      void syncNow().catch(() => {});
    }, TEAM_AUDIT_SYNC_INTERVAL_MS);
    return () => {
      clearInterval(timer);
    };
  }, [enabled, identity?.accessToken, syncEnabled, syncNow]);

  return useMemo(
    () => ({
      loading,
      syncing,
      events,
      pendingCount: events.length,
      deviceId,
      lastError,
      lastSyncAt,
      lastCloudExportJob,
      cloudExportJobs,
      record,
      clear,
      syncNow,
      exportSnapshot,
      requestCloudExport,
      refreshCloudExports,
      retryCloudExport,
      deleteCloudExport,
    }),
    [
      clear,
      cloudExportJobs,
      deviceId,
      events,
      exportSnapshot,
      lastCloudExportJob,
      lastError,
      lastSyncAt,
      loading,
      record,
      refreshCloudExports,
      retryCloudExport,
      deleteCloudExport,
      requestCloudExport,
      syncNow,
      syncing,
    ]
  );
}

export const auditLogTestUtils = {
  pruneAuditEvents,
  buildAuditEvent,
  serializeAuditEvents,
  normalizeAuditExportJob,
  normalizeAuditExportJobs,
};

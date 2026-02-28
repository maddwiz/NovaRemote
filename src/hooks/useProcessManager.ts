import { useCallback, useEffect, useState } from "react";

import { apiRequest } from "../api/client";
import { ProcessInfo, ServerProfile } from "../types";

type UseProcessManagerArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
  enabled: boolean;
};

function normalizeProcessList(payload: unknown): ProcessInfo[] {
  const hasPidShape = (value: unknown[]): boolean =>
    value.some((entry) => {
      if (!entry || typeof entry !== "object") {
        return false;
      }
      const raw = entry as Record<string, unknown>;
      return Number.isFinite(Number(raw.pid));
    });

  const source = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { processes?: unknown[] }).processes)
      ? (payload as { processes: unknown[] }).processes
      : payload &&
          typeof payload === "object" &&
          Array.isArray((payload as { items?: unknown[] }).items) &&
          hasPidShape((payload as { items: unknown[] }).items)
        ? (payload as { items: unknown[] }).items
        : [];

  return source
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      const raw = entry as Record<string, unknown>;
      const pid = Number(raw.pid);
      if (!Number.isFinite(pid) || pid <= 0) {
        return null;
      }
      return {
        pid,
        name: typeof raw.name === "string" ? raw.name : typeof raw.command === "string" ? raw.command.split(" ")[0] || "process" : "process",
        cpu_percent: typeof raw.cpu_percent === "number" ? raw.cpu_percent : typeof raw.cpu === "number" ? raw.cpu : undefined,
        mem_percent: typeof raw.mem_percent === "number" ? raw.mem_percent : typeof raw.mem === "number" ? raw.mem : undefined,
        uptime_seconds:
          typeof raw.uptime_seconds === "number" ? raw.uptime_seconds : typeof raw.uptime === "number" ? raw.uptime : undefined,
        user: typeof raw.user === "string" ? raw.user : undefined,
        command: typeof raw.command === "string" ? raw.command : undefined,
      } as ProcessInfo;
    })
    .filter((entry): entry is ProcessInfo => Boolean(entry))
    .sort((a, b) => (b.cpu_percent || 0) - (a.cpu_percent || 0));
}

export function useProcessManager({ activeServer, connected, enabled }: UseProcessManagerArgs) {
  const [processes, setProcesses] = useState<ProcessInfo[]>([]);
  const [processesBusy, setProcessesBusy] = useState<boolean>(false);

  const refreshProcesses = useCallback(async () => {
    if (!activeServer || !connected || !enabled) {
      setProcesses([]);
      return;
    }
    setProcessesBusy(true);
    try {
      const payload = await apiRequest<unknown>(activeServer.baseUrl, activeServer.token, "/proc/list");
      setProcesses(normalizeProcessList(payload));
    } finally {
      setProcessesBusy(false);
    }
  }, [activeServer, connected, enabled]);

  useEffect(() => {
    if (!connected || !enabled) {
      setProcesses([]);
      return;
    }
    void refreshProcesses();
    const id = setInterval(() => {
      void refreshProcesses();
    }, 5000);
    return () => clearInterval(id);
  }, [connected, enabled, refreshProcesses]);

  return {
    processes,
    processesBusy,
    refreshProcesses,
  };
}


import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerProfile } from "../types";
import { useNovaAdaptBridge } from "./useNovaAdaptBridge";

type BridgeHandle = ReturnType<typeof useNovaAdaptBridge>;

function buildServer(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: overrides.id || "dgx",
    name: overrides.name || "DGX",
    baseUrl: overrides.baseUrl || "https://dgx.novaremote.test",
    token: overrides.token || "bridge-token",
    defaultCwd: overrides.defaultCwd || "/workspace",
    source: "local",
    ...overrides,
  };
}

function responseOf(status: number, payload: unknown, statusText: string = "OK"): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    json: vi.fn(async () => payload),
  } as unknown as Response;
}

function latestOrThrow(value: BridgeHandle | null): BridgeHandle {
  if (!value) {
    throw new Error("Bridge hook did not initialize");
  }
  return value;
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("fetch", vi.fn());
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("useNovaAdaptBridge", () => {
  it("loads bridge health, plans, jobs, memory, and workflows", async () => {
    const server = buildServer();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/agents/health?deep=1")) {
        return responseOf(200, { ok: true, features: { agents: true } });
      }
      if (url.endsWith("/agents/plans?limit=12")) {
        return responseOf(200, [
          {
            id: "plan-1",
            objective: "Watch DGX",
            status: "pending",
            created_at: "2026-03-10T00:00:00.000Z",
            updated_at: "2026-03-10T01:00:00.000Z",
            progress_completed: 1,
            progress_total: 3,
          },
        ]);
      }
      if (url.endsWith("/agents/jobs?limit=12")) {
        return responseOf(200, [
          {
            id: "job-1",
            status: "running",
            created_at: "2026-03-10T00:00:00.000Z",
          },
        ]);
      }
      if (url.endsWith("/agents/memory/status")) {
        return responseOf(200, { ok: true, enabled: true, backend: "novaspine-http" });
      }
      if (url.endsWith("/agents/workflows/list?limit=12&context=api")) {
        return responseOf(200, {
          workflows: [
            {
              workflow_id: "wf-1",
              objective: "Nightly cleanup",
              status: "queued",
              updated_at: "2026-03-10T02:00:00.000Z",
            },
          ],
        });
      }
      if (url.endsWith("/agents/plans/plan-1/approve_async")) {
        expect(init?.method).toBe("POST");
        return responseOf(200, { ok: true });
      }
      throw new Error(`Unexpected fetch ${url}`);
    });

    let latest: BridgeHandle | null = null;
    function Harness() {
      latest = useNovaAdaptBridge({ server, refreshIntervalMs: 60_000 });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await waitFor(() => !latestOrThrow(latest).loading, "bridge load");

    expect(latestOrThrow(latest).supported).toBe(true);
    expect(latestOrThrow(latest).runtimeAvailable).toBe(true);
    expect(latestOrThrow(latest).plans[0]).toMatchObject({
      id: "plan-1",
      objective: "Watch DGX",
      status: "pending",
    });
    expect(latestOrThrow(latest).jobs[0]).toMatchObject({ id: "job-1", status: "running" });
    expect(latestOrThrow(latest).memoryStatus).toMatchObject({ backend: "novaspine-http", enabled: true });
    expect(latestOrThrow(latest).workflows[0]).toMatchObject({ workflowId: "wf-1", status: "queued" });

    await act(async () => {
      await latestOrThrow(latest).approvePlanAsync("plan-1");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dgx.novaremote.test/agents/plans/plan-1/approve_async",
      expect.objectContaining({ method: "POST" })
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("treats missing bridge endpoints as unsupported instead of surfacing an error", async () => {
    const server = buildServer();
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValue(responseOf(404, { detail: "not found" }, "Not Found"));

    let latest: BridgeHandle | null = null;
    function Harness() {
      latest = useNovaAdaptBridge({ server, refreshIntervalMs: 60_000 });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await waitFor(() => !latestOrThrow(latest).loading, "unsupported bridge resolution");

    expect(latestOrThrow(latest).supported).toBe(false);
    expect(latestOrThrow(latest).runtimeAvailable).toBe(false);
    expect(latestOrThrow(latest).error).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
  });
});

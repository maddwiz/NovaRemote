import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerProfile } from "../types";
import { novaAdaptBridgeTestUtils, useNovaAdaptBridge } from "./useNovaAdaptBridge";

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

function streamResponse(body: string, status: number = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
    },
  });
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
      if (url.includes("/agents/events/stream")) {
        return streamResponse('event: timeout\ndata: {"request_id":"test"}\n\n');
      }
      if (url.endsWith("/agents/plans/plan-1/approve_async")) {
        expect(init?.method).toBe("POST");
        return responseOf(200, { ok: true });
      }
      if (url.endsWith("/agents/plans")) {
        expect(init?.method).toBe("POST");
        return responseOf(200, {
          id: "plan-2",
          objective: "Create a deployment plan",
          status: "pending",
          created_at: "2026-03-10T03:00:00.000Z",
          updated_at: "2026-03-10T03:00:00.000Z",
          progress_completed: 0,
          progress_total: 2,
        });
      }
      if (url.endsWith("/agents/workflows/start")) {
        expect(init?.method).toBe("POST");
        return responseOf(200, {
          workflow_id: "wf-2",
          objective: "Watch the render deploy",
          status: "queued",
          updated_at: "2026-03-10T03:30:00.000Z",
        });
      }
      if (url.endsWith("/agents/workflows/resume")) {
        expect(init?.method).toBe("POST");
        return responseOf(200, {
          workflow_id: "wf-2",
          objective: "Watch the render deploy",
          status: "running",
          updated_at: "2026-03-10T03:31:00.000Z",
        });
      }
      if (url.includes("/agents/plans/plan-1/stream")) {
        return streamResponse('event: end\ndata: {"id":"plan-1","status":"pending"}\n\n');
      }
      if (url.includes("/agents/jobs/job-1/stream")) {
        return streamResponse('event: end\ndata: {"id":"job-1","status":"running"}\n\n');
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
      const createdPlan = await latestOrThrow(latest).createPlan("Create a deployment plan");
      expect(createdPlan).toMatchObject({ id: "plan-2", status: "pending" });
    });

    await act(async () => {
      const workflow = await latestOrThrow(latest).startWorkflow("Watch the render deploy", {
        metadata: { capabilities: ["watch"] },
      });
      expect(workflow).toMatchObject({ workflowId: "wf-2", status: "running" });
    });

    await act(async () => {
      await latestOrThrow(latest).resumeWorkflow("wf-2");
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://dgx.novaremote.test/agents/workflows/resume",
      expect.objectContaining({ method: "POST" })
    );

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("refreshes bridge state when relevant audit events arrive", async () => {
    const server = buildServer();
    const fetchMock = vi.mocked(fetch);
    let plansFetchCount = 0;

    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/agents/health?deep=1")) {
        return responseOf(200, { ok: true, features: { agents: true } });
      }
      if (url.endsWith("/agents/plans?limit=12")) {
        plansFetchCount += 1;
        if (plansFetchCount === 1) {
          return responseOf(200, []);
        }
        return responseOf(200, [
          {
            id: "plan-9",
            objective: "Auto recover cluster",
            status: "approved",
            created_at: "2026-03-10T04:00:00.000Z",
            updated_at: "2026-03-10T04:05:00.000Z",
            progress_completed: 1,
            progress_total: 1,
          },
        ]);
      }
      if (url.endsWith("/agents/jobs?limit=12")) {
        return responseOf(200, []);
      }
      if (url.endsWith("/agents/memory/status")) {
        return responseOf(200, { ok: true, enabled: true, backend: "novaspine-http" });
      }
      if (url.endsWith("/agents/workflows/list?limit=12&context=api")) {
        return responseOf(200, { workflows: [] });
      }
      if (url.includes("/agents/events/stream")) {
        return streamResponse(
          'event: audit\ndata: {"id":17,"category":"plans","action":"approve_async","entity_type":"plan","entity_id":"plan-9"}\n\n' +
            'event: timeout\ndata: {"request_id":"test"}\n\n'
        );
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
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 350));
    });
    await waitFor(() => latestOrThrow(latest).plans.some((plan) => plan.id === "plan-9"), "audit-triggered refresh");

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/agents/events/stream"),
      expect.objectContaining({ method: "GET" })
    );
    expect(latestOrThrow(latest).plans[0]).toMatchObject({ id: "plan-9", status: "approved" });

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

  it("parses sse event batches", () => {
    const parsed = novaAdaptBridgeTestUtils.extractSseEvents([
      "event: plan",
      'data: {"id":"plan-1"}',
      "",
      "event: end",
      'data: {"status":"done"}',
      "",
    ]);

    expect(parsed).toEqual([
      { event: "plan", data: '{"id":"plan-1"}' },
      { event: "end", data: '{"status":"done"}' },
    ]);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { apiRequestMock, normalizeBaseUrlMock } = vi.hoisted(() => ({
  apiRequestMock: vi.fn(),
  normalizeBaseUrlMock: vi.fn((baseUrl: string) => baseUrl.replace(/\/+$/, "")),
}));

vi.mock("../../api/client", () => ({
  apiRequest: apiRequestMock,
  normalizeBaseUrl: normalizeBaseUrlMock,
}));

import { createVrSessionClient, VrServerTarget } from "../sessionClient";

function makeServer(): VrServerTarget {
  return {
    id: "dgx",
    name: "DGX Spark",
    baseUrl: "https://dgx.example.com/",
    token: "test-token",
  };
}

beforeEach(() => {
  apiRequestMock.mockReset();
  normalizeBaseUrlMock.mockClear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("createVrSessionClient", () => {
  it("lists sessions through the selected terminal API base path", async () => {
    apiRequestMock.mockResolvedValue({
      sessions: [{ name: "main" }, { name: "build" }],
    });

    const client = createVrSessionClient();
    const result = await client.listSessions(makeServer(), "/tmux");

    expect(result).toEqual([{ name: "main" }, { name: "build" }]);
    expect(apiRequestMock).toHaveBeenCalledWith(
      "https://dgx.example.com/",
      "test-token",
      "/tmux/sessions"
    );
  });

  it("creates sessions and sends command/control lifecycle payloads", async () => {
    apiRequestMock.mockResolvedValue({ ok: true });

    const client = createVrSessionClient();
    const server = makeServer();

    await client.createSession(server, "/terminal", "main", "/workspace");
    await client.send(server, "/terminal", "main", "npm run build", true);
    await client.ctrl(server, "/terminal", "main", "C-c");
    await client.stopSession(server, "/terminal", "main");
    await client.openOnMac(server, "main");

    expect(apiRequestMock).toHaveBeenNthCalledWith(
      1,
      server.baseUrl,
      server.token,
      "/terminal/session",
      {
        method: "POST",
        body: JSON.stringify({ session: "main", cwd: "/workspace" }),
      }
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      2,
      server.baseUrl,
      server.token,
      "/terminal/send",
      {
        method: "POST",
        body: JSON.stringify({ session: "main", text: "npm run build", enter: true }),
      }
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      3,
      server.baseUrl,
      server.token,
      "/terminal/ctrl",
      {
        method: "POST",
        body: JSON.stringify({ session: "main", key: "C-c" }),
      }
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      4,
      server.baseUrl,
      server.token,
      "/terminal/ctrl",
      {
        method: "POST",
        body: JSON.stringify({ session: "main", key: "C-c" }),
      }
    );
    expect(apiRequestMock).toHaveBeenNthCalledWith(
      5,
      server.baseUrl,
      server.token,
      "/mac/attach",
      {
        method: "POST",
        body: JSON.stringify({ session: "main" }),
      }
    );
  });

  it("clamps tail line count and URL-encodes session names", async () => {
    apiRequestMock.mockResolvedValue({ output: "tail" });

    const client = createVrSessionClient();
    const output = await client.tail(makeServer(), "/tmux", "build/main", 10_000);

    expect(output).toBe("tail");
    expect(apiRequestMock).toHaveBeenCalledWith(
      "https://dgx.example.com/",
      "test-token",
      "/tmux/tail?session=build%2Fmain&lines=1000"
    );
  });

  it("returns health latency when endpoint responds OK", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-03T12:00:00.000Z"));

    const fetchMock = vi.fn(async () => ({ ok: true })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", fetchMock);

    const client = createVrSessionClient();
    const server = makeServer();
    const promise = client.health(server);
    vi.setSystemTime(new Date("2026-03-03T12:00:00.025Z"));
    const result = await promise;

    expect(result).toEqual({ ok: true, latencyMs: 25 });
    expect(fetchMock).toHaveBeenCalledWith("https://dgx.example.com/health", {
      method: "GET",
      headers: {
        Authorization: "Bearer test-token",
      },
    });
  });

  it("reports unhealthy status on non-OK or network failure", async () => {
    const client = createVrSessionClient();
    const server = makeServer();

    const nonOkFetch = vi.fn(async () => ({ ok: false })) as unknown as typeof fetch;
    vi.stubGlobal("fetch", nonOkFetch);
    await expect(client.health(server)).resolves.toEqual({ ok: false, latencyMs: null });

    const failFetch = vi.fn(async () => {
      throw new Error("offline");
    }) as unknown as typeof fetch;
    vi.stubGlobal("fetch", failFetch);
    await expect(client.health(server)).resolves.toEqual({ ok: false, latencyMs: null });
  });
});

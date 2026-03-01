import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

import { apiRequest, normalizeBaseUrl, websocketUrl } from "./client";

const fetchMock = vi.fn();

beforeAll(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("normalizeBaseUrl", () => {
  it("trims whitespace and trailing slashes", () => {
    expect(normalizeBaseUrl("  https://example.com/// ")).toBe("https://example.com");
  });
});

describe("websocketUrl", () => {
  it("converts https to wss and encodes session names", () => {
    const value = websocketUrl("https://example.com/", "session one");
    expect(value).toBe("wss://example.com/tmux/stream?session=session%20one");
  });

  it("supports custom stream paths without leading slash", () => {
    const value = websocketUrl("http://example.com", "s-1", "terminal/stream");
    expect(value).toBe("ws://example.com/terminal/stream?session=s-1");
  });
});

describe("apiRequest", () => {
  it("sets auth header and default json content type when body is present", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ ok: true }),
    } as unknown as Response);

    await apiRequest<{ ok: boolean }>("https://server.test/", "abc123", "/health", {
      method: "POST",
      body: JSON.stringify({ ping: true }),
    });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(url).toBe("https://server.test/health");
    expect(headers.get("Authorization")).toBe("Bearer abc123");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("preserves explicit content type header", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ ok: true }),
    } as unknown as Response);

    await apiRequest<{ ok: boolean }>("https://server.test", "abc123", "/upload", {
      method: "POST",
      headers: { "Content-Type": "text/plain" },
      body: "hello",
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const headers = init.headers as Headers;
    expect(headers.get("Content-Type")).toBe("text/plain");
  });

  it("throws json detail for failed responses when available", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      json: async () => ({ detail: "invalid token" }),
    } as unknown as Response);

    await expect(apiRequest("https://server.test", "bad", "/health")).rejects.toThrow("401 invalid token");
  });

  it("falls back to status text when error payload is not json", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("invalid json");
      },
    } as unknown as Response);

    await expect(apiRequest("https://server.test", "tok", "/health")).rejects.toThrow("500 Internal Server Error");
  });
});

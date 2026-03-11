import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { LlmProfile } from "../types";
import { llmClientTestUtils } from "./useLlmClient";
import { useLlmClient } from "./useLlmClient";

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
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

function makeProfile(kind: LlmProfile["kind"]): LlmProfile {
  return {
    id: `profile-${kind}`,
    name: `Profile ${kind}`,
    kind,
    baseUrl: "https://example.com/v1",
    apiKey: "test-key",
    model: "test-model",
  };
}

describe("llmClientTestUtils", () => {
  it("parses extra headers safely", () => {
    const headers = llmClientTestUtils.parseExtraHeaders(
      "X-Foo: bar\nInvalid Header\nAuthorization: Bearer abc\nX-Num: 42"
    );

    expect(headers).toEqual({
      "X-Foo": "bar",
      Authorization: "Bearer abc",
      "X-Num": "42",
    });
  });

  it("maps commands to powershell backend", () => {
    expect(llmClientTestUtils.mapCommandToBackend("ls -la", "powershell")).toBe("Get-ChildItem -la");
    expect(llmClientTestUtils.mapCommandToBackend("cat /tmp/log", "pwsh")).toBe("Get-Content /tmp/log");
  });

  it("normalizes llm send options", () => {
    const customTool = {
      name: "demo_tool",
      description: "demo",
      parameters: { type: "object", properties: {} },
      run: () => "{}",
    };
    const normalized = llmClientTestUtils.normalizeOptions({
      imageUrl: "  https://example.com/x.png  ",
      enableBuiltInTools: true,
      maxToolRounds: 99,
      customTools: [customTool],
      toolContext: {
        project: " NovaRemote ",
        empty: "   ",
      },
    });

    expect(normalized.imageUrl).toBe("https://example.com/x.png");
    expect(normalized.enableBuiltInTools).toBe(true);
    expect(normalized.maxToolRounds).toBe(5);
    expect(normalized.customTools).toEqual([customTool]);
    expect(normalized.toolContext).toEqual({ project: "NovaRemote" });
  });

  it("extracts openai streaming deltas", () => {
    const delta = llmClientTestUtils.extractOpenAiStreamText(
      'data: {"choices":[{"delta":{"content":"hello"}}]}'
    );
    expect(delta).toBe("hello");
  });

  it("extracts anthropic streaming deltas", () => {
    const delta = llmClientTestUtils.extractAnthropicStreamText(
      'data: {"type":"content_block_delta","delta":{"text":"world"}}'
    );
    expect(delta).toBe("world");
  });

  it("extracts ollama ndjson deltas", () => {
    const delta = llmClientTestUtils.extractOllamaStreamText('{"response":"chunk","done":false}');
    expect(delta).toBe("chunk");
  });

  it("splits stream buffers while preserving the remainder", () => {
    const next = llmClientTestUtils.splitStreamBuffer("data: one\r\ndata: two\r\npartial");
    expect(next.lines).toEqual(["data: one", "data: two"]);
    expect(next.remainder).toBe("partial");
  });

  it("builds timing metrics with optional first token latency", () => {
    const startedAt = Date.now() - 40;
    const metrics = llmClientTestUtils.buildTimingMetrics(startedAt, startedAt + 10, true);
    expect(metrics.streamed).toBe(true);
    expect(metrics.totalMs).toBeGreaterThanOrEqual(0);
    expect(metrics.firstTokenMs).toBeGreaterThanOrEqual(0);
  });
});

describe("useLlmClient", () => {
  it("falls back to the non-streaming path when the runtime cannot consume the stream body", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: "fallback reply" } }] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    let latest: ReturnType<typeof useLlmClient> | null = null;
    function Harness() {
      latest = useLlmClient();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    let resultText = "";
    await act(async () => {
      resultText = (await latest!.sendPromptStream(makeProfile("openai_compatible"), "hello world")).text;
    });

    expect(resultText).toBe("fallback reply");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

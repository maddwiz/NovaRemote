import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../constants", () => {
  let idCounter = 0;
  return {
    makeId: () => {
      idCounter += 1;
      return `id-${idCounter}`;
    },
  };
});

import type { LlmProfile, LlmSendResult } from "../types";
import type { NovaAssistantRuntimeContext } from "../novaAssistant";
import { useNovaAssistant } from "./useNovaAssistant";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

const context: NovaAssistantRuntimeContext = {
  route: "terminals",
  focusedServerId: "dgx",
  focusedServerName: "DGX Spark",
  focusedSession: "build-main",
  activeProfileName: "OpenAI",
  files: {
    currentPath: "/workspace/app",
    includeHidden: false,
    selectedFilePath: "/workspace/app/package.json",
    selectedContentPreview: "{\"name\":\"nova\"}",
    entries: [{ name: "package.json", path: "/workspace/app/package.json", isDir: false }],
  },
  team: {
    loggedIn: true,
    teamName: "Nova Team",
    role: "admin",
    cloudDashboardUrl: "https://nova.example/dashboard",
    auditPendingCount: 2,
  },
  processes: {
    available: true,
    busy: false,
    items: [{ pid: 321, name: "node", cpuPercent: 10, memPercent: 5, command: "node server.js" }],
  },
  servers: [
    {
      id: "dgx",
      name: "DGX Spark",
      connected: true,
      vmHost: "Lab Rack",
      hasPortainerUrl: true,
      hasGrafanaUrl: true,
      hasProxmoxUrl: false,
      hasSshFallback: true,
      sessions: [{ session: "build-main", mode: "shell", localAi: false, live: true }],
    },
  ],
  settings: {
    glassesEnabled: false,
    glassesVoiceAutoSend: false,
    glassesVoiceLoop: false,
    glassesWakePhraseEnabled: false,
    glassesMinimalMode: false,
    glassesTextScale: 1,
    startAiEngine: "auto",
    startKind: "ai",
    poolPaused: false,
  },
};

function makeProfile(kind: LlmProfile["kind"]): LlmProfile {
  return {
    id: `profile-${kind}`,
    name: `Profile ${kind}`,
    kind,
    baseUrl: "https://example.com",
    apiKey: "test-key",
    model: "test-model",
  };
}

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

describe("useNovaAssistant", () => {
  it("uses native tool-calling for openai-compatible profiles", async () => {
    const sendPromptDetailed = vi.fn<
      (profile: LlmProfile, prompt: string, options?: unknown) => Promise<LlmSendResult>
    >(async () => ({
      text: "I’ll open the file and refresh processes.",
      toolCalls: [
        {
          name: "plan_nova_actions",
          arguments: JSON.stringify({
            reply: "I’ll open the file and refresh processes.",
            actions: [
              { type: "open_file", path: "/workspace/app/package.json" },
              { type: "refresh_processes", serverRef: "dgx" },
            ],
          }),
          output: '{"accepted":true}',
        },
      ],
      usedVision: false,
      usedTools: true,
    }));
    const executeActions = vi.fn(async (actions) =>
      actions.map((action: { type: string }) => ({
        action: action.type,
        ok: true,
        detail: `Executed ${action.type}`,
      }))
    );

    let latest: ReturnType<typeof useNovaAssistant> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useNovaAssistant({
        activeProfile: makeProfile("openai_compatible"),
        sendPromptDetailed,
        buildContext: () => context,
        executeActions,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      const ok = await current().submit("Open package.json and refresh processes.");
      expect(ok).toBe(true);
    });

    expect(sendPromptDetailed).toHaveBeenCalledTimes(1);
    expect(sendPromptDetailed.mock.calls[0]?.[2]).toMatchObject({
      maxToolRounds: 2,
    });
    expect(Array.isArray((sendPromptDetailed.mock.calls[0]?.[2] as { customTools?: unknown[] })?.customTools)).toBe(true);
    expect(executeActions).toHaveBeenCalledWith(
      [
        { type: "open_file", path: "/workspace/app/package.json", serverRef: undefined },
        { type: "refresh_processes", serverRef: "dgx" },
      ],
      context
    );
    const lastMessage = current().messages.at(-1);
    expect(lastMessage?.role).toBe("assistant");
    expect(lastMessage?.content).toContain("I’ll open the file and refresh processes.");
    expect(lastMessage?.content).toContain("Executed open_file");
    expect(current().busy).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("falls back to prompt-to-json planning for non-native providers", async () => {
    const sendPromptDetailed = vi.fn<
      (profile: LlmProfile, prompt: string, options?: unknown) => Promise<LlmSendResult>
    >(async () => ({
      text: JSON.stringify({
        reply: "I’ll request the audit export.",
        actions: [{ type: "team_request_audit_export", format: "csv", rangeHours: 24 }],
      }),
      toolCalls: [],
      usedVision: false,
      usedTools: false,
    }));
    const executeActions = vi.fn(async (actions) =>
      actions.map((action: { type: string }) => ({
        action: action.type,
        ok: true,
        detail: `Executed ${action.type}`,
      }))
    );

    let latest: ReturnType<typeof useNovaAssistant> | null = null;

    function Harness() {
      latest = useNovaAssistant({
        activeProfile: makeProfile("anthropic"),
        sendPromptDetailed,
        buildContext: () => context,
        executeActions,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      const ok = await latest!.submit("Request a csv audit export for the last day.");
      expect(ok).toBe(true);
    });

    expect(sendPromptDetailed).toHaveBeenCalledTimes(1);
    expect(sendPromptDetailed.mock.calls[0]?.[2]).toEqual({ responseFormat: "json" });
    expect(executeActions).toHaveBeenCalledWith(
      [{ type: "team_request_audit_export", format: "csv", rangeHours: 24 }],
      context
    );
    expect(latest!.messages.at(-1)?.content).toContain("I’ll request the audit export.");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("normalizes folder requests before executing fallback planner actions", async () => {
    const sendPromptDetailed = vi.fn<
      (profile: LlmProfile, prompt: string, options?: unknown) => Promise<LlmSendResult>
    >(async () => ({
      text: JSON.stringify({
        reply: "I’ll create that folder.",
        actions: [{ type: "send_command", serverRef: "dgx", sessionRef: "build-main", command: "create folder novadez", mode: "ai" }],
      }),
      toolCalls: [],
      usedVision: false,
      usedTools: false,
    }));
    const executeActions = vi.fn(async (actions) =>
      actions.map((action: { type: string }) => ({
        action: action.type,
        ok: true,
        detail: `Executed ${action.type}`,
      }))
    );

    let latest: ReturnType<typeof useNovaAssistant> | null = null;

    function Harness() {
      latest = useNovaAssistant({
        activeProfile: makeProfile("anthropic"),
        sendPromptDetailed,
        buildContext: () => context,
        executeActions,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      const ok = await latest!.submit("Create a folder on my desktop named novadez.");
      expect(ok).toBe(true);
    });

    expect(executeActions).toHaveBeenCalledWith([{ type: "create_folder", serverRef: "dgx", path: "~/Desktop/novadez" }], context);
    expect(latest!.messages.at(-1)?.content).toContain("Executed create_folder");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

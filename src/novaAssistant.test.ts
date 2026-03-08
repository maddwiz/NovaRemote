import { describe, expect, it } from "vitest";

import {
  buildNovaAssistantPrompt,
  novaAssistantTestUtils,
  parseNovaAssistantPlan,
  resolveAssistantServer,
  resolveAssistantSession,
  type NovaAssistantRuntimeContext,
} from "./novaAssistant";

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
    entries: [
      { name: "src", path: "/workspace/app/src", isDir: true },
      { name: "package.json", path: "/workspace/app/package.json", isDir: false },
    ],
  },
  team: {
    loggedIn: true,
    teamName: "Nova Team",
    role: "admin",
    cloudDashboardUrl: "https://nova.example/dashboard",
    auditPendingCount: 2,
  },
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
  servers: [
    {
      id: "dgx",
      name: "DGX Spark",
      connected: true,
      vmHost: "Lab Rack",
      sessions: [
        { session: "build-main", mode: "shell", localAi: false, live: true },
        { session: "codex-ui", mode: "ai", localAi: false, live: true },
      ],
    },
    {
      id: "cloud",
      name: "Cloud VM",
      connected: true,
      vmHost: "AWS",
      sessions: [{ session: "deploy", mode: "shell", localAi: false, live: false }],
    },
  ],
};

describe("novaAssistant", () => {
  it("parses fenced json plans and keeps only valid actions", () => {
    const plan = parseNovaAssistantPlan(`\`\`\`json
      {
        "reply": "Opening the terminal.",
        "actions": [
          { "type": "navigate", "route": "terminals" },
          { "type": "set_preference", "key": "start.aiEngine", "value": "external" },
          { "type": "unknown_action" }
        ]
      }
    \`\`\``);

    expect(plan.reply).toBe("Opening the terminal.");
    expect(plan.actions).toHaveLength(2);
    expect(plan.actions[0]).toEqual({ type: "navigate", route: "terminals" });
    expect(plan.actions[1]).toEqual({
      type: "set_preference",
      key: "start.aiEngine",
      value: "external",
    });
  });

  it("parses file and team actions", () => {
    const plan = parseNovaAssistantPlan(
      JSON.stringify({
        reply: "Working through the file and team tasks.",
        actions: [
          { type: "list_files", path: "/workspace/app", includeHidden: true },
          { type: "open_file", path: "/workspace/app/package.json" },
          { type: "tail_file", path: "/workspace/app/logs/app.log", lines: 120 },
          { type: "save_file", path: "/workspace/app/.env", content: "A=1" },
          { type: "team_refresh" },
          { type: "team_open_dashboard" },
          { type: "team_sync_audit" },
          { type: "team_request_audit_export", format: "csv", rangeHours: 48 },
          { type: "team_refresh_audit_exports" },
        ],
      })
    );

    expect(plan.actions).toEqual([
      { type: "list_files", path: "/workspace/app", includeHidden: true, serverRef: undefined },
      { type: "open_file", path: "/workspace/app/package.json", serverRef: undefined },
      { type: "tail_file", path: "/workspace/app/logs/app.log", lines: 120, serverRef: undefined },
      { type: "save_file", path: "/workspace/app/.env", content: "A=1", serverRef: undefined },
      { type: "team_refresh" },
      { type: "team_open_dashboard" },
      { type: "team_sync_audit" },
      { type: "team_request_audit_export", format: "csv", rangeHours: 48 },
      { type: "team_refresh_audit_exports" },
    ]);
  });

  it("falls back to plain reply when the model does not return json", () => {
    const plan = parseNovaAssistantPlan("I can do that, but I need you to pick a server first.");
    expect(plan.actions).toEqual([]);
    expect(plan.reply).toContain("pick a server");
  });

  it("resolves servers by focused placeholder and fuzzy metadata", () => {
    expect(resolveAssistantServer(context, "$focused_server")?.id).toBe("dgx");
    expect(resolveAssistantServer(context, "lab rack")?.id).toBe("dgx");
    expect(resolveAssistantServer(context, "cloud")?.id).toBe("cloud");
  });

  it("resolves sessions by placeholder, exact name, and last-created reference", () => {
    const dgx = resolveAssistantServer(context, "dgx");
    expect(dgx).not.toBeNull();
    expect(resolveAssistantSession(context, dgx!, "$focused_session")?.session).toBe("build-main");
    expect(resolveAssistantSession(context, dgx!, "codex ui")?.session).toBe("codex-ui");
    expect(resolveAssistantSession(context, dgx!, "$last_session", "codex-ui")?.session).toBe("codex-ui");
  });

  it("serializes prompt context with conversation and action instructions", () => {
    const prompt = buildNovaAssistantPrompt({
      context,
      history: [
        {
          id: "m1",
          role: "user",
          content: "Open the build terminal on my DGX.",
          createdAt: "2026-03-08T00:00:00.000Z",
        },
      ],
      input: "Open the build terminal on my DGX.",
    });

    expect(prompt).toContain('"route": "terminals"');
    expect(prompt).toContain('"name": "DGX Spark"');
    expect(prompt).toContain('"currentPath": "/workspace/app"');
    expect(prompt).toContain('"teamName": "Nova Team"');
    expect(prompt).toContain('"type":"send_command"');
    expect(prompt).toContain('"type":"save_file"');
    expect(prompt).toContain('"type":"team_request_audit_export"');
  });

  it("exposes helper parse fallback for malformed objects", () => {
    expect(novaAssistantTestUtils.extractJsonObject("not json")).toBeNull();
    expect(novaAssistantTestUtils.normalizeAction({ type: "navigate", route: "llms" })).toEqual({
      type: "navigate",
      route: "llms",
    });
  });
});

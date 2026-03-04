import { describe, expect, it } from "vitest";

import { findVrPanelByTarget, parseVrVoiceIntent, VrRoutePanel } from "../voiceRouting";

const PANELS: VrRoutePanel[] = [
  {
    id: "dgx-main",
    serverId: "dgx",
    serverName: "DGX Spark",
    session: "main",
    sessionLabel: "main",
  },
  {
    id: "home-build",
    serverId: "homelab",
    serverName: "Homelab",
    vmHost: "Rack A",
    vmType: "qemu",
    vmName: "build-worker-vm",
    vmId: "202",
    session: "build-01",
    sessionLabel: "Build Worker",
  },
];

describe("findVrPanelByTarget", () => {
  it("matches exact server names ignoring punctuation and case", () => {
    const panel = findVrPanelByTarget(PANELS, "dgx spark!!!");
    expect(panel?.id).toBe("dgx-main");
  });

  it("falls back to token scoring", () => {
    const panel = findVrPanelByTarget(PANELS, "worker homelab");
    expect(panel?.id).toBe("home-build");
  });

  it("matches vm host and vm name targets", () => {
    const panelByVmHost = findVrPanelByTarget(PANELS, "rack a");
    const panelByVmName = findVrPanelByTarget(PANELS, "build-worker-vm");
    expect(panelByVmHost?.id).toBe("home-build");
    expect(panelByVmName?.id).toBe("home-build");
  });
});

describe("parseVrVoiceIntent", () => {
  it("parses explicit send-to commands", () => {
    const intent = parseVrVoiceIntent("send to homelab: npm run build", PANELS, "dgx-main");
    expect(intent).toEqual({ kind: "send", panelId: "home-build", command: "npm run build" });
  });

  it("parses explicit send-to commands without a colon delimiter", () => {
    const intent = parseVrVoiceIntent("send to Build Worker npm run build", PANELS, "dgx-main");
    expect(intent).toEqual({ kind: "send", panelId: "home-build", command: "npm run build" });
  });

  it("parses vm metadata targets in explicit routing", () => {
    const byVmName = parseVrVoiceIntent("send to build-worker-vm: npm run build", PANELS, "dgx-main");
    const byVmHost = parseVrVoiceIntent("send to rack a npm run build", PANELS, "dgx-main");
    expect(byVmName).toEqual({ kind: "send", panelId: "home-build", command: "npm run build" });
    expect(byVmHost).toEqual({ kind: "send", panelId: "home-build", command: "npm run build" });
  });

  it("parses focus commands", () => {
    const intent = parseVrVoiceIntent("focus build-01", PANELS, "dgx-main");
    expect(intent).toEqual({ kind: "focus", panelId: "home-build" });
  });

  it("handles workspace overview and rotate", () => {
    expect(parseVrVoiceIntent("show all", PANELS, "dgx-main")).toEqual({ kind: "overview" });
    expect(parseVrVoiceIntent("show me all logs", PANELS, "dgx-main")).toEqual({ kind: "overview" });
    expect(parseVrVoiceIntent("focus mode", PANELS, "dgx-main")).toEqual({ kind: "minimize" });
    expect(parseVrVoiceIntent("interrupt", PANELS, "dgx-main")).toEqual({
      kind: "control",
      panelId: "dgx-main",
      char: "C-c",
    });
    expect(parseVrVoiceIntent("ctrl z for build worker", PANELS, "dgx-main")).toEqual({
      kind: "control",
      panelId: "home-build",
      char: "C-z",
    });
    expect(parseVrVoiceIntent("layout grid", PANELS, "dgx-main")).toEqual({
      kind: "layout_preset",
      preset: "grid",
    });
    expect(parseVrVoiceIntent("snap cockpit", PANELS, "dgx-main")).toEqual({
      kind: "layout_preset",
      preset: "cockpit",
    });
    expect(parseVrVoiceIntent("rotate left", PANELS, "dgx-main")).toEqual({
      kind: "rotate_workspace",
      direction: "left",
    });
    expect(parseVrVoiceIntent("stop session for build worker", PANELS, "dgx-main")).toEqual({
      kind: "stop_session",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("open on mac for homelab", PANELS, "dgx-main")).toEqual({
      kind: "open_on_mac",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("open dgx spark on mac", PANELS, "home-build")).toEqual({
      kind: "open_on_mac",
      panelId: "dgx-main",
    });
    expect(parseVrVoiceIntent("share live for homelab", PANELS, "dgx-main")).toEqual({
      kind: "share_live",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("create spectator link", PANELS, "home-build")).toEqual({
      kind: "share_live",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("reconnect homelab", PANELS, "dgx-main")).toEqual({
      kind: "reconnect_server",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("reconnect all", PANELS, "dgx-main")).toEqual({
      kind: "reconnect_all",
    });
    expect(parseVrVoiceIntent("create agent build watcher", PANELS, "dgx-main")).toEqual({
      kind: "create_agent",
      name: "build watcher",
    });
    expect(parseVrVoiceIntent("create agent deploy bot for homelab", PANELS, "dgx-main")).toEqual({
      kind: "create_agent",
      name: "deploy bot",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("create agent deploy bot for all servers", PANELS, "dgx-main")).toEqual({
      kind: "create_agent",
      name: "deploy bot",
      allServers: true,
    });
    expect(parseVrVoiceIntent("create agent watch for errors", PANELS, "dgx-main")).toEqual({
      kind: "create_agent",
      name: "watch for errors",
    });
    expect(parseVrVoiceIntent("set agent deploy bot goal npm run deploy", PANELS, "dgx-main")).toEqual({
      kind: "set_agent_goal",
      name: "deploy bot",
      goal: "npm run deploy",
    });
    expect(
      parseVrVoiceIntent("agent build watcher goal tail -f logs for homelab", PANELS, "dgx-main")
    ).toEqual({
      kind: "set_agent_goal",
      name: "build watcher",
      goal: "tail -f logs",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("set agent build watcher goal npm run lint for all", PANELS, "dgx-main")).toEqual({
      kind: "set_agent_goal",
      name: "build watcher",
      goal: "npm run lint",
      allServers: true,
    });
    expect(parseVrVoiceIntent("set agent deploy bot goal run deploy for staging", PANELS, "dgx-main")).toEqual({
      kind: "set_agent_goal",
      name: "deploy bot",
      goal: "run deploy for staging",
    });
    expect(parseVrVoiceIntent("agent build watcher run npm run test", PANELS, "dgx-main")).toEqual({
      kind: "queue_agent_command",
      name: "build watcher",
      command: "npm run test",
    });
    expect(parseVrVoiceIntent("agent deploy bot execute npm run deploy for homelab", PANELS, "dgx-main")).toEqual({
      kind: "queue_agent_command",
      name: "deploy bot",
      command: "npm run deploy",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("agent deploy bot run npm run deploy for all servers", PANELS, "dgx-main")).toEqual({
      kind: "queue_agent_command",
      name: "deploy bot",
      command: "npm run deploy",
      allServers: true,
    });
    expect(parseVrVoiceIntent("approve ready agents", PANELS, "dgx-main")).toEqual({
      kind: "approve_ready_agents",
    });
    expect(parseVrVoiceIntent("approve ready agents for homelab", PANELS, "dgx-main")).toEqual({
      kind: "approve_ready_agents",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("approve ready agents for all servers", PANELS, "dgx-main")).toEqual({
      kind: "approve_ready_agents",
    });
    expect(parseVrVoiceIntent("deny all pending agents", PANELS, "dgx-main")).toEqual({
      kind: "deny_all_pending_agents",
    });
    expect(parseVrVoiceIntent("deny pending agents for dgx spark", PANELS, "home-build")).toEqual({
      kind: "deny_all_pending_agents",
      panelId: "dgx-main",
    });
    expect(parseVrVoiceIntent("deny pending agents for all", PANELS, "home-build")).toEqual({
      kind: "deny_all_pending_agents",
    });
    expect(parseVrVoiceIntent("pause pool", PANELS, "dgx-main")).toEqual({
      kind: "pause_pool",
    });
    expect(parseVrVoiceIntent("resume all streams", PANELS, "dgx-main")).toEqual({
      kind: "resume_pool",
    });
  });

  it("focuses target panels for natural show-logs phrasing", () => {
    const intent = parseVrVoiceIntent("show me build logs", PANELS, "dgx-main");
    expect(intent).toEqual({ kind: "focus", panelId: "home-build" });
  });

  it("parses panel visual control commands", () => {
    expect(parseVrVoiceIntent("mini panel", PANELS, "home-build")).toEqual({
      kind: "panel_mini",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("expand panel", PANELS, "home-build")).toEqual({
      kind: "panel_expand",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("opacity 45%", PANELS, "home-build")).toEqual({
      kind: "panel_opacity",
      panelId: "home-build",
      opacity: 0.45,
    });
    expect(parseVrVoiceIntent("opacity 400%", PANELS, "home-build")).toEqual({
      kind: "panel_opacity",
      panelId: "home-build",
      opacity: 1,
    });
    expect(parseVrVoiceIntent("opacity 1%", PANELS, "home-build")).toEqual({
      kind: "panel_opacity",
      panelId: "home-build",
      opacity: 0.2,
    });
    expect(parseVrVoiceIntent("mini for dgx spark", PANELS, "home-build")).toEqual({
      kind: "panel_mini",
      panelId: "dgx-main",
    });
    expect(parseVrVoiceIntent("expand homelab", PANELS, "dgx-main")).toEqual({
      kind: "panel_expand",
      panelId: "home-build",
    });
    expect(parseVrVoiceIntent("opacity 67 for build worker", PANELS, "dgx-main")).toEqual({
      kind: "panel_opacity",
      panelId: "home-build",
      opacity: 0.67,
    });
    expect(parseVrVoiceIntent("set homelab opacity to 45%", PANELS, "dgx-main")).toEqual({
      kind: "panel_opacity",
      panelId: "home-build",
      opacity: 0.45,
    });
  });

  it("falls back to focused panel when not explicitly routed", () => {
    const intent = parseVrVoiceIntent("git status", PANELS, "home-build");
    expect(intent).toEqual({ kind: "send", panelId: "home-build", command: "git status" });
  });
});

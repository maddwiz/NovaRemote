import { describe, expect, it } from "vitest";

import { resolveSpatialVoiceRoute } from "./useSpatialVoiceRouting";

const PANELS = [
  {
    id: "dgx::main",
    serverId: "dgx",
    serverName: "DGX Spark",
    session: "main",
    sessionLabel: "main",
  },
  {
    id: "home::build-01",
    serverId: "home",
    serverName: "Homelab",
    vmHost: "Rack A",
    vmType: "qemu",
    vmName: "build-runner",
    vmId: "201",
    session: "build-01",
    sessionLabel: "build-01",
  },
  {
    id: "cloud::deploy",
    serverId: "cloud",
    serverName: "Cloud VM",
    vmHost: "Rack B",
    vmType: "cloud",
    vmName: "deploy-node",
    vmId: "c-17",
    session: "deploy",
    sessionLabel: "deploy",
  },
];

describe("resolveSpatialVoiceRoute", () => {
  it("routes explicit send-to syntax to a matching panel", () => {
    const route = resolveSpatialVoiceRoute({
      transcript: "send to homelab: npm run build",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(route).toEqual({
      kind: "send_command",
      panelId: "home::build-01",
      command: "npm run build",
    });
  });

  it("routes explicit send-to syntax without a colon delimiter", () => {
    const route = resolveSpatialVoiceRoute({
      transcript: "send to Cloud VM deploy now",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(route).toEqual({
      kind: "send_command",
      panelId: "cloud::deploy",
      command: "deploy now",
    });
  });

  it("routes explicit send-to syntax with vm metadata targets", () => {
    const routeByVmName = resolveSpatialVoiceRoute({
      transcript: "send to build-runner: npm run build",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const routeByVmHost = resolveSpatialVoiceRoute({
      transcript: "send to rack b deploy now",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(routeByVmName).toEqual({
      kind: "send_command",
      panelId: "home::build-01",
      command: "npm run build",
    });
    expect(routeByVmHost).toEqual({
      kind: "send_command",
      panelId: "cloud::deploy",
      command: "deploy now",
    });
  });

  it("routes focus commands by session name", () => {
    const route = resolveSpatialVoiceRoute({
      transcript: "focus deploy",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(route).toEqual({
      kind: "focus_panel",
      panelId: "cloud::deploy",
    });
  });

  it("recognizes overview and minimize commands", () => {
    const showAll = resolveSpatialVoiceRoute({
      transcript: "show all panels",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const minimize = resolveSpatialVoiceRoute({
      transcript: "focus mode",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(showAll).toEqual({ kind: "show_all" });
    expect(minimize).toEqual({ kind: "minimize" });
  });

  it("routes natural show-logs phrasing to panel focus", () => {
    const focusLogs = resolveSpatialVoiceRoute({
      transcript: "show me build logs",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const showAllLogs = resolveSpatialVoiceRoute({
      transcript: "show me all logs",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(focusLogs).toEqual({
      kind: "focus_panel",
      panelId: "home::build-01",
    });
    expect(showAllLogs).toEqual({ kind: "show_all" });
  });

  it("recognizes rotate workspace commands", () => {
    const rotateLeft = resolveSpatialVoiceRoute({
      transcript: "rotate left",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const rotateRight = resolveSpatialVoiceRoute({
      transcript: "next panel",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(rotateLeft).toEqual({ kind: "rotate_workspace", direction: "left" });
    expect(rotateRight).toEqual({ kind: "rotate_workspace", direction: "right" });
  });

  it("recognizes reconnect server and reconnect all commands", () => {
    const reconnectServer = resolveSpatialVoiceRoute({
      transcript: "reconnect homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const reconnectAll = resolveSpatialVoiceRoute({
      transcript: "reconnect all",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(reconnectServer).toEqual({
      kind: "reconnect_server",
      panelId: "home::build-01",
    });
    expect(reconnectAll).toEqual({ kind: "reconnect_all" });
  });

  it("recognizes voice session and panel management commands", () => {
    const createAiFocused = resolveSpatialVoiceRoute({
      transcript: "open codex",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const createAiTargeted = resolveSpatialVoiceRoute({
      transcript: "start ai on dgx spark",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const createShellTargeted = resolveSpatialVoiceRoute({
      transcript: "new terminal on homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const closeFocused = resolveSpatialVoiceRoute({
      transcript: "close this",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const closeTargeted = resolveSpatialVoiceRoute({
      transcript: "dismiss deploy",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const closeRemoveTargeted = resolveSpatialVoiceRoute({
      transcript: "remove cloud vm",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const closeRemoveFocused = resolveSpatialVoiceRoute({
      transcript: "remove that",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const resizeFocused = resolveSpatialVoiceRoute({
      transcript: "double size",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const resizeTargeted = resolveSpatialVoiceRoute({
      transcript: "fullscreen cloud vm",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const resizeNormal = resolveSpatialVoiceRoute({
      transcript: "normal size",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const moveFocused = resolveSpatialVoiceRoute({
      transcript: "move to left",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const moveTargeted = resolveSpatialVoiceRoute({
      transcript: "pull up deploy",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const swapPanels = resolveSpatialVoiceRoute({
      transcript: "swap homelab and cloud vm",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });

    expect(createAiFocused).toEqual({
      kind: "create_session",
      serverId: "home",
      sessionKind: "ai",
    });
    expect(createAiTargeted).toEqual({
      kind: "create_session",
      serverId: "dgx",
      sessionKind: "ai",
    });
    expect(createShellTargeted).toEqual({
      kind: "create_session",
      serverId: "home",
      sessionKind: "shell",
    });
    expect(closeFocused).toEqual({
      kind: "close_panel",
      panelId: "home::build-01",
    });
    expect(closeTargeted).toEqual({
      kind: "close_panel",
      panelId: "cloud::deploy",
    });
    expect(closeRemoveTargeted).toEqual({
      kind: "close_panel",
      panelId: "cloud::deploy",
    });
    expect(closeRemoveFocused).toEqual({
      kind: "close_panel",
      panelId: "home::build-01",
    });
    expect(resizeFocused).toEqual({
      kind: "resize_panel",
      panelId: "home::build-01",
      scale: "double",
    });
    expect(resizeTargeted).toEqual({
      kind: "resize_panel",
      panelId: "cloud::deploy",
      scale: "fullscreen",
    });
    expect(resizeNormal).toEqual({
      kind: "resize_panel",
      panelId: "home::build-01",
      scale: "normal",
    });
    expect(moveFocused).toEqual({
      kind: "move_panel",
      panelId: "home::build-01",
      position: "left",
    });
    expect(moveTargeted).toEqual({
      kind: "move_panel",
      panelId: "cloud::deploy",
      position: "center",
    });
    expect(swapPanels).toEqual({
      kind: "swap_panels",
      panelIdA: "home::build-01",
      panelIdB: "cloud::deploy",
    });
  });

  it("recognizes control and lifecycle commands", () => {
    const interrupt = resolveSpatialVoiceRoute({
      transcript: "interrupt for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const ctrlZ = resolveSpatialVoiceRoute({
      transcript: "ctrl z for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const stopSession = resolveSpatialVoiceRoute({
      transcript: "stop session for deploy",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const openOnMac = resolveSpatialVoiceRoute({
      transcript: "open on mac for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const shareLive = resolveSpatialVoiceRoute({
      transcript: "share live for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const shareSpectateFallback = resolveSpatialVoiceRoute({
      transcript: "create spectate link",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const pinPanel = resolveSpatialVoiceRoute({
      transcript: "pin panel for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const unpinFocused = resolveSpatialVoiceRoute({
      transcript: "unpin panel",
      panels: PANELS,
      focusedPanelId: "home::build-01",
    });
    const addPanel = resolveSpatialVoiceRoute({
      transcript: "add panel for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const removePanel = resolveSpatialVoiceRoute({
      transcript: "hide panel for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const pausePool = resolveSpatialVoiceRoute({
      transcript: "pause all streams",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const resumePool = resolveSpatialVoiceRoute({
      transcript: "resume pool",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const approveReady = resolveSpatialVoiceRoute({
      transcript: "approve ready agents",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const denyPending = resolveSpatialVoiceRoute({
      transcript: "deny all pending agents",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const approveReadyForHomelab = resolveSpatialVoiceRoute({
      transcript: "approve ready agents for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const approveReadyForAllServers = resolveSpatialVoiceRoute({
      transcript: "approve ready agents for all servers",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const denyPendingForCloud = resolveSpatialVoiceRoute({
      transcript: "deny all pending agents for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const denyPendingForAllServers = resolveSpatialVoiceRoute({
      transcript: "deny all pending agents for all",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const createAgent = resolveSpatialVoiceRoute({
      transcript: "create agent build watcher",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const createAgentForHomelab = resolveSpatialVoiceRoute({
      transcript: "create agent deploy bot for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const createAgentForAllServers = resolveSpatialVoiceRoute({
      transcript: "create agent deploy bot for all servers",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const removeAgent = resolveSpatialVoiceRoute({
      transcript: "remove agent build watcher",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const removeAgentForCloud = resolveSpatialVoiceRoute({
      transcript: "delete agent deploy bot for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const removeAgentForAllServers = resolveSpatialVoiceRoute({
      transcript: "remove agent deploy bot for all servers",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentStatus = resolveSpatialVoiceRoute({
      transcript: "set agent deploy bot status monitoring",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentStatusForCloud = resolveSpatialVoiceRoute({
      transcript: "agent build watcher status waiting for approval for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentStatusForAllServers = resolveSpatialVoiceRoute({
      transcript: "set agent build watcher status executing for all servers",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const createAgentWithForPhrase = resolveSpatialVoiceRoute({
      transcript: "create agent watch for errors",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentGoal = resolveSpatialVoiceRoute({
      transcript: "set agent deploy bot goal npm run deploy",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentGoalForCloud = resolveSpatialVoiceRoute({
      transcript: "agent build watcher goal tail -f logs for cloud vm",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentGoalForAllServers = resolveSpatialVoiceRoute({
      transcript: "set agent build watcher goal npm run lint for all",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const setAgentGoalWithForPhrase = resolveSpatialVoiceRoute({
      transcript: "set agent deploy bot goal run deploy for staging",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const queueAgentCommand = resolveSpatialVoiceRoute({
      transcript: "agent build watcher run npm run test",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const queueAgentCommandForHomelab = resolveSpatialVoiceRoute({
      transcript: "agent deploy bot execute npm run deploy for homelab",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });
    const queueAgentCommandForAllServers = resolveSpatialVoiceRoute({
      transcript: "agent deploy bot run npm run deploy for all servers",
      panels: PANELS,
      focusedPanelId: "dgx::main",
    });

    expect(interrupt).toEqual({
      kind: "control_char",
      panelId: "home::build-01",
      char: "\u0003",
    });
    expect(ctrlZ).toEqual({
      kind: "control_char",
      panelId: "cloud::deploy",
      char: "\u001a",
    });
    expect(stopSession).toEqual({
      kind: "stop_session",
      panelId: "cloud::deploy",
    });
    expect(openOnMac).toEqual({
      kind: "open_on_mac",
      panelId: "home::build-01",
    });
    expect(shareLive).toEqual({
      kind: "share_live",
      panelId: "cloud::deploy",
    });
    expect(shareSpectateFallback).toEqual({
      kind: "share_live",
      panelId: "home::build-01",
    });
    expect(pinPanel).toEqual({
      kind: "pin_panel",
      panelId: "cloud::deploy",
    });
    expect(unpinFocused).toEqual({
      kind: "unpin_panel",
      panelId: "home::build-01",
    });
    expect(addPanel).toEqual({
      kind: "add_panel",
      panelId: "home::build-01",
    });
    expect(removePanel).toEqual({
      kind: "remove_panel",
      panelId: "cloud::deploy",
    });
    expect(pausePool).toEqual({
      kind: "pause_pool",
    });
    expect(resumePool).toEqual({
      kind: "resume_pool",
    });
    expect(approveReady).toEqual({
      kind: "approve_ready_agents",
    });
    expect(denyPending).toEqual({
      kind: "deny_all_pending_agents",
    });
    expect(approveReadyForHomelab).toEqual({
      kind: "approve_ready_agents",
      panelId: "home::build-01",
    });
    expect(approveReadyForAllServers).toEqual({
      kind: "approve_ready_agents",
    });
    expect(denyPendingForCloud).toEqual({
      kind: "deny_all_pending_agents",
      panelId: "cloud::deploy",
    });
    expect(denyPendingForAllServers).toEqual({
      kind: "deny_all_pending_agents",
    });
    expect(createAgent).toEqual({
      kind: "create_agent",
      name: "build watcher",
    });
    expect(createAgentForHomelab).toEqual({
      kind: "create_agent",
      name: "deploy bot",
      panelId: "home::build-01",
    });
    expect(createAgentForAllServers).toEqual({
      kind: "create_agent",
      name: "deploy bot",
      allServers: true,
    });
    expect(removeAgent).toEqual({
      kind: "remove_agent",
      name: "build watcher",
    });
    expect(removeAgentForCloud).toEqual({
      kind: "remove_agent",
      name: "deploy bot",
      panelId: "cloud::deploy",
    });
    expect(removeAgentForAllServers).toEqual({
      kind: "remove_agent",
      name: "deploy bot",
      allServers: true,
    });
    expect(setAgentStatus).toEqual({
      kind: "set_agent_status",
      name: "deploy bot",
      status: "monitoring",
    });
    expect(setAgentStatusForCloud).toEqual({
      kind: "set_agent_status",
      name: "build watcher",
      status: "waiting_approval",
      panelId: "cloud::deploy",
    });
    expect(setAgentStatusForAllServers).toEqual({
      kind: "set_agent_status",
      name: "build watcher",
      status: "executing",
      allServers: true,
    });
    expect(createAgentWithForPhrase).toEqual({
      kind: "create_agent",
      name: "watch for errors",
    });
    expect(setAgentGoal).toEqual({
      kind: "set_agent_goal",
      name: "deploy bot",
      goal: "npm run deploy",
    });
    expect(setAgentGoalForCloud).toEqual({
      kind: "set_agent_goal",
      name: "build watcher",
      goal: "tail -f logs",
      panelId: "cloud::deploy",
    });
    expect(setAgentGoalForAllServers).toEqual({
      kind: "set_agent_goal",
      name: "build watcher",
      goal: "npm run lint",
      allServers: true,
    });
    expect(setAgentGoalWithForPhrase).toEqual({
      kind: "set_agent_goal",
      name: "deploy bot",
      goal: "run deploy for staging",
    });
    expect(queueAgentCommand).toEqual({
      kind: "queue_agent_command",
      name: "build watcher",
      command: "npm run test",
    });
    expect(queueAgentCommandForHomelab).toEqual({
      kind: "queue_agent_command",
      name: "deploy bot",
      command: "npm run deploy",
      panelId: "home::build-01",
    });
    expect(queueAgentCommandForAllServers).toEqual({
      kind: "queue_agent_command",
      name: "deploy bot",
      command: "npm run deploy",
      allServers: true,
    });
  });

  it("defaults to sending on the focused panel", () => {
    const route = resolveSpatialVoiceRoute({
      transcript: "git status",
      panels: PANELS,
      focusedPanelId: "cloud::deploy",
    });

    expect(route).toEqual({
      kind: "send_command",
      panelId: "cloud::deploy",
      command: "git status",
    });
  });
});

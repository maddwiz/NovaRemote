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
    session: "build-01",
    sessionLabel: "build-01",
  },
  {
    id: "cloud::deploy",
    serverId: "cloud",
    serverName: "Cloud VM",
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

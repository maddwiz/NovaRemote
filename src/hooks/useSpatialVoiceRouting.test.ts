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

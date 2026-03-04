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

  it("parses focus commands", () => {
    const intent = parseVrVoiceIntent("focus build-01", PANELS, "dgx-main");
    expect(intent).toEqual({ kind: "focus", panelId: "home-build" });
  });

  it("handles workspace overview and rotate", () => {
    expect(parseVrVoiceIntent("show all", PANELS, "dgx-main")).toEqual({ kind: "overview" });
    expect(parseVrVoiceIntent("focus mode", PANELS, "dgx-main")).toEqual({ kind: "minimize" });
    expect(parseVrVoiceIntent("rotate left", PANELS, "dgx-main")).toEqual({
      kind: "rotate_workspace",
      direction: "left",
    });
  });

  it("falls back to focused panel when not explicitly routed", () => {
    const intent = parseVrVoiceIntent("git status", PANELS, "home-build");
    expect(intent).toEqual({ kind: "send", panelId: "home-build", command: "git status" });
  });
});

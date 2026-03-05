import { describe, expect, it } from "vitest";

import {
  buildSpatialPanels,
  cyclicalIndex,
  ensurePanelVisible,
  normalizePanelOrder,
  SpatialPanelCandidate,
} from "./spatialPanelPlanner";

function panel(overrides: Partial<SpatialPanelCandidate>): SpatialPanelCandidate {
  return {
    id: "dgx::main",
    serverId: "dgx",
    serverName: "DGX",
    session: "main",
    sessionLabel: "main",
    output: "",
    draft: "",
    sending: false,
    readOnly: false,
    ...overrides,
  };
}

describe("normalizePanelOrder", () => {
  it("prioritizes panels from the focused server", () => {
    const focused = panel({ id: "dgx::main", serverId: "dgx", serverName: "DGX", session: "main" });
    const other = panel({ id: "cloud::main", serverId: "cloud", serverName: "Cloud", session: "main" });

    expect(normalizePanelOrder(focused, other, "dgx")).toBeLessThan(0);
    expect(normalizePanelOrder(other, focused, "dgx")).toBeGreaterThan(0);
  });

  it("falls back to server and session sorting", () => {
    const a = panel({ id: "a::build", serverName: "Alpha", session: "build" });
    const b = panel({ id: "b::main", serverName: "Beta", session: "main" });

    expect(normalizePanelOrder(a, b, null)).toBeLessThan(0);
    expect(normalizePanelOrder(b, a, null)).toBeGreaterThan(0);
  });
});

describe("cyclicalIndex", () => {
  it("wraps positive and negative indexes", () => {
    expect(cyclicalIndex(0, 5)).toBe(0);
    expect(cyclicalIndex(6, 5)).toBe(1);
    expect(cyclicalIndex(-1, 5)).toBe(4);
  });

  it("returns zero for empty sizes", () => {
    expect(cyclicalIndex(99, 0)).toBe(0);
  });
});

describe("ensurePanelVisible", () => {
  it("appends a missing panel when there is room", () => {
    expect(ensurePanelVisible(["dgx::main"], [], "home::build", 4)).toEqual(["dgx::main", "home::build"]);
  });

  it("injects a focused panel while preserving pinned panels first", () => {
    const next = ensurePanelVisible(
      ["dgx::main", "home::build", "cloud::deploy"],
      ["dgx::main"],
      "lab::ops",
      3
    );
    expect(next).toEqual(["dgx::main", "lab::ops", "home::build"]);
  });

  it("keeps layout unchanged when every visible slot is pinned", () => {
    const next = ensurePanelVisible(["a", "b", "c"], ["a", "b", "c"], "x", 3);
    expect(next).toEqual(["a", "b", "c"]);
  });
});

describe("buildSpatialPanels", () => {
  const panels = [
    panel({ id: "dgx::main", serverId: "dgx", serverName: "DGX", session: "main" }),
    panel({ id: "home::build", serverId: "home", serverName: "Homelab", session: "build", sessionLabel: "Build" }),
    panel({ id: "cloud::deploy", serverId: "cloud", serverName: "Cloud", session: "deploy", sessionLabel: "deploy" }),
  ];

  it("returns an empty layout when there are no panel ids", () => {
    expect(buildSpatialPanels(panels, null, [], [], true)).toEqual([]);
  });

  it("returns only the focused center panel in focus mode", () => {
    const result = buildSpatialPanels(
      panels,
      "home::build",
      ["dgx::main", "home::build", "cloud::deploy"],
      ["home::build"],
      false
    );

    expect(result).toEqual([
      {
        id: "home::build",
        serverId: "home",
        serverName: "Homelab",
        session: "build",
        sessionLabel: "Build",
        position: "center",
        pinned: true,
        focused: true,
        output: "",
        scale: 1,
      },
    ]);
  });

  it("maps panel positions in overview mode around the focused panel", () => {
    const manyPanels = [
      ...panels,
      panel({ id: "edge::logs", serverId: "edge", serverName: "Edge", session: "logs" }),
      panel({ id: "lab::ops", serverId: "lab", serverName: "Lab", session: "ops" }),
      panel({ id: "extra::ignore", serverId: "extra", serverName: "Extra", session: "ignore" }),
    ];

    const result = buildSpatialPanels(
      manyPanels,
      "cloud::deploy",
      ["dgx::main", "home::build", "cloud::deploy", "edge::logs", "lab::ops", "extra::ignore"],
      ["edge::logs"],
      true
    );

    expect(result.map((entry) => entry.id)).toEqual([
      "cloud::deploy",
      "dgx::main",
      "home::build",
      "edge::logs",
      "lab::ops",
    ]);
    expect(result.map((entry) => entry.position)).toEqual(["center", "left", "right", "above", "below"]);
    expect(result.find((entry) => entry.id === "edge::logs")?.pinned).toBe(true);
    expect(result.find((entry) => entry.id === "cloud::deploy")?.focused).toBe(true);
  });

  it("applies preferred positions, panel scales, and fullscreen focus", () => {
    const overview = buildSpatialPanels(
      panels,
      "home::build",
      ["dgx::main", "home::build", "cloud::deploy"],
      [],
      true,
      {
        panelPositions: {
          "home::build": "left",
          "dgx::main": "center",
        },
        panelScales: {
          "home::build": 2,
        },
      }
    );

    expect(overview.find((entry) => entry.id === "home::build")?.position).toBe("left");
    expect(overview.find((entry) => entry.id === "home::build")?.scale).toBe(2);

    const fullscreen = buildSpatialPanels(
      panels,
      "home::build",
      ["dgx::main", "home::build", "cloud::deploy"],
      [],
      true,
      {
        fullscreenPanelId: "cloud::deploy",
      }
    );
    expect(fullscreen).toEqual([
      {
        id: "cloud::deploy",
        serverId: "cloud",
        serverName: "Cloud",
        session: "deploy",
        sessionLabel: "deploy",
        position: "center",
        pinned: false,
        focused: true,
        output: "",
        scale: 1,
      },
    ]);
  });
});

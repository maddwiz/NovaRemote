import { describe, expect, it } from "vitest";

import { VrPanelState } from "../contracts";
import { buildPresetLayout } from "../layoutPresets";

function makePanels(count: number): VrPanelState[] {
  return Array.from({ length: count }).map((_, index) => ({
    id: `panel-${index + 1}`,
    serverId: `server-${index + 1}`,
    serverName: `Server ${index + 1}`,
    session: `session-${index + 1}`,
    sessionLabel: `session-${index + 1}`,
    transform: {
      x: 0,
      y: 1.4,
      z: -1.8,
      yaw: 0,
      width: 1,
      height: 0.6,
    },
  }));
}

describe("buildPresetLayout", () => {
  it("keeps layout unchanged for custom preset", () => {
    const input = makePanels(2);
    const output = buildPresetLayout("custom", input);

    expect(output).toBe(input);
  });

  it("lays out arc panels with ordered yaw values", () => {
    const output = buildPresetLayout("arc", makePanels(3));

    expect(output).toHaveLength(3);
    expect(output[0]?.transform.yaw).toBeLessThan(output[1]?.transform.yaw ?? 0);
    expect(output[1]?.transform.yaw).toBeLessThan(output[2]?.transform.yaw ?? 0);
    expect(output[1]?.transform.x).toBeCloseTo(0, 3);
  });

  it("uses 3 columns in grid when panel count is above four", () => {
    const output = buildPresetLayout("grid", makePanels(6));

    expect(output[0]?.transform.y).toBeCloseTo(output[1]?.transform.y ?? 0, 6);
    expect(output[0]?.transform.y).toBeCloseTo(output[2]?.transform.y ?? 0, 6);
    expect(output[3]?.transform.y).toBeLessThan(output[0]?.transform.y ?? 0);
  });

  it("stacks panels vertically in stacked preset", () => {
    const output = buildPresetLayout("stacked", makePanels(3));

    expect(output[0]?.transform.x).toBe(0);
    expect(output[1]?.transform.y).toBeLessThan(output[0]?.transform.y ?? 0);
    expect(output[2]?.transform.y).toBeLessThan(output[1]?.transform.y ?? 0);
  });

  it("arranges cockpit panels on alternating sides", () => {
    const output = buildPresetLayout("cockpit", makePanels(4));

    expect(output[0]?.transform.x).toBeLessThan(0);
    expect(output[1]?.transform.x).toBeGreaterThan(0);
    expect(output[0]?.transform.yaw).toBeGreaterThan(0);
    expect(output[1]?.transform.yaw).toBeLessThan(0);
  });
});

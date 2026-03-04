import { describe, expect, it } from "vitest";

import { ServerProfile } from "./types";
import { buildVmHostTargetGroups } from "./fleetTargets";

function makeServer(
  id: string,
  name: string,
  vmHost?: string
): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
    vmHost,
  };
}

describe("buildVmHostTargetGroups", () => {
  it("groups servers by vmHost and excludes standalone servers", () => {
    const groups = buildVmHostTargetGroups([
      makeServer("a", "A", "Lab-1"),
      makeServer("b", "B", "lab-1"),
      makeServer("c", "C", "Cloud"),
      makeServer("d", "D"),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.map((group) => group.label)).toEqual(["Cloud", "Lab-1"]);
    expect(groups.find((group) => group.label === "Lab-1")?.serverIds).toEqual(["a", "b"]);
    expect(groups.some((group) => group.serverIds.includes("d"))).toBe(false);
  });
});


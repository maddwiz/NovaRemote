import { describe, expect, it } from "vitest";

import { ServerProfile } from "./types";
import { buildVmHostTargetGroups, buildVmHostVmTypeTargetGroups } from "./fleetTargets";

function makeServer(
  id: string,
  name: string,
  vmHost?: string,
  vmType?: ServerProfile["vmType"]
): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
    vmHost,
    vmType,
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

  it("groups vm host targets by vm type hierarchy labels", () => {
    const groups = buildVmHostVmTypeTargetGroups([
      makeServer("a", "A", "Lab-1", "proxmox"),
      makeServer("b", "B", "Lab-1", "qemu"),
      makeServer("c", "C", "Lab-1"),
      makeServer("d", "D", "Cloud", "cloud"),
      makeServer("e", "E"),
    ]);

    expect(groups.map((group) => group.label)).toEqual([
      "Cloud / Cloud",
      "Lab-1 / Proxmox",
      "Lab-1 / QEMU",
      "Lab-1 / General",
    ]);
    expect(groups.find((group) => group.label === "Lab-1 / Proxmox")?.serverIds).toEqual(["a"]);
    expect(groups.find((group) => group.label === "Lab-1 / General")?.serverIds).toEqual(["c"]);
    expect(groups.some((group) => group.serverIds.includes("e"))).toBe(false);
  });
});

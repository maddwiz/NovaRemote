import { ServerProfile } from "./types";

export type FleetTargetGroup = {
  key: string;
  label: string;
  serverIds: string[];
};

export function buildVmHostTargetGroups(servers: ServerProfile[]): FleetTargetGroup[] {
  const grouped = new Map<string, { label: string; serverIds: string[] }>();

  servers.forEach((server) => {
    const vmHost = server.vmHost?.trim() || "";
    if (!vmHost) {
      return;
    }

    const key = `vmhost:${vmHost.toLowerCase()}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.serverIds.push(server.id);
      return;
    }
    grouped.set(key, { label: vmHost, serverIds: [server.id] });
  });

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      label: value.label,
      serverIds: value.serverIds,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}


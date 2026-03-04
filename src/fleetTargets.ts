import { ServerProfile, VmType } from "./types";

export type FleetTargetGroup = {
  key: string;
  label: string;
  serverIds: string[];
};

const VM_TYPE_ORDER: VmType[] = ["proxmox", "vmware", "hyper-v", "qemu", "virtualbox", "lxc", "docker", "cloud"];
const VM_TYPE_LABELS: Record<VmType, string> = {
  proxmox: "Proxmox",
  vmware: "VMware",
  "hyper-v": "Hyper-V",
  docker: "Docker",
  lxc: "LXC",
  qemu: "QEMU",
  virtualbox: "VirtualBox",
  cloud: "Cloud",
};

function normalizeVmType(vmType: ServerProfile["vmType"]): VmType | null {
  if (!vmType) {
    return null;
  }
  return VM_TYPE_ORDER.includes(vmType) ? vmType : null;
}

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

export function buildVmHostVmTypeTargetGroups(servers: ServerProfile[]): FleetTargetGroup[] {
  const grouped = new Map<string, { hostLabel: string; vmType: VmType | null; serverIds: string[] }>();

  servers.forEach((server) => {
    const vmHost = server.vmHost?.trim() || "";
    if (!vmHost) {
      return;
    }

    const vmType = normalizeVmType(server.vmType);
    const vmTypeKey = vmType || "general";
    const key = `vmtype:${vmHost.toLowerCase()}:${vmTypeKey}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.serverIds.push(server.id);
      return;
    }
    grouped.set(key, { hostLabel: vmHost, vmType, serverIds: [server.id] });
  });

  return Array.from(grouped.entries())
    .map(([key, value]) => ({
      key,
      label: `${value.hostLabel} / ${value.vmType ? VM_TYPE_LABELS[value.vmType] : "General"}`,
      hostLabel: value.hostLabel,
      vmType: value.vmType,
      serverIds: value.serverIds,
    }))
    .sort((a, b) => {
      const hostOrder = (a.hostLabel as string).localeCompare(b.hostLabel as string);
      if (hostOrder !== 0) {
        return hostOrder;
      }
      const aRank = a.vmType ? VM_TYPE_ORDER.indexOf(a.vmType as VmType) : Number.MAX_SAFE_INTEGER;
      const bRank = b.vmType ? VM_TYPE_ORDER.indexOf(b.vmType as VmType) : Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) {
        return aRank - bRank;
      }
      return a.label.localeCompare(b.label);
    })
    .map(({ key, label, serverIds }) => ({
      key,
      label,
      serverIds,
    }));
}

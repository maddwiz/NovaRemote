import { ServerConnection, ServerProfile, VmType } from "./types";

export type ServerRailGroup = {
  key: string;
  label: string;
  isStandalone: boolean;
  servers: ServerProfile[];
  vmTypeGroups: {
    key: string;
    label: string;
    servers: ServerProfile[];
  }[];
};

type GroupServersByVmHostOptions = {
  standalonePosition?: "first" | "last";
};

export type ServerSwitcherMenuAction = {
  text: string;
  style?: "default" | "cancel" | "destructive";
  onPress?: () => void;
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

function sortServerWithinGroup(a: ServerProfile, b: ServerProfile): number {
  const aKey = (a.vmName || a.name).toLowerCase();
  const bKey = (b.vmName || b.name).toLowerCase();
  if (aKey === bKey) {
    return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  }
  return aKey.localeCompare(bKey);
}

function sortVmTypeGroups(
  a: { vmType: VmType | null; label: string; servers: ServerProfile[] },
  b: { vmType: VmType | null; label: string; servers: ServerProfile[] }
): number {
  const aRank = a.vmType ? VM_TYPE_ORDER.indexOf(a.vmType) : Number.MAX_SAFE_INTEGER;
  const bRank = b.vmType ? VM_TYPE_ORDER.indexOf(b.vmType) : Number.MAX_SAFE_INTEGER;
  if (aRank !== bRank) {
    return aRank - bRank;
  }
  if (a.label !== b.label) {
    return a.label.localeCompare(b.label);
  }
  return b.servers.length - a.servers.length;
}

export function groupServersByVmHost(
  servers: ServerProfile[],
  options: GroupServersByVmHostOptions = {}
): ServerRailGroup[] {
  const standalonePosition = options.standalonePosition || "last";
  const byKey = new Map<string, ServerRailGroup>();

  servers.forEach((server) => {
    const rawVmHost = server.vmHost?.trim() || "";
    const key = rawVmHost ? `vmhost:${rawVmHost.toLowerCase()}` : "standalone";
    const label = rawVmHost || "Standalone";
    const existing = byKey.get(key);
    if (existing) {
      existing.servers.push(server);
      return;
    }

    const created: ServerRailGroup = {
      key,
      label,
      isStandalone: !rawVmHost,
      servers: [server],
      vmTypeGroups: [],
    };
    byKey.set(key, created);
  });

  const groups = Array.from(byKey.values())
    .map((group) => {
      const orderedServers = group.servers.slice().sort(sortServerWithinGroup);
      const vmBuckets = new Map<string, { vmType: VmType | null; label: string; servers: ServerProfile[] }>();
      orderedServers.forEach((server) => {
        const vmType = normalizeVmType(server.vmType);
        const key = vmType ? `vmtype:${vmType}` : "vmtype:general";
        const label = vmType ? VM_TYPE_LABELS[vmType] : "General";
        const bucket = vmBuckets.get(key);
        if (bucket) {
          bucket.servers.push(server);
          return;
        }
        vmBuckets.set(key, { vmType, label, servers: [server] });
      });

      const vmTypeGroups = Array.from(vmBuckets.entries())
        .map(([entryKey, bucket]) => ({
          key: entryKey,
          vmType: bucket.vmType,
          label: bucket.label,
          servers: bucket.servers,
        }))
        .sort(sortVmTypeGroups)
        .map(({ key: vmTypeKey, label: vmTypeLabel, servers: vmTypeServers }) => ({
          key: vmTypeKey,
          label: vmTypeLabel,
          servers: vmTypeServers,
        }));

      return {
        ...group,
        servers: orderedServers,
        vmTypeGroups,
      };
    })
    .sort((a, b) => {
      if (a.isStandalone !== b.isStandalone) {
        if (standalonePosition === "first") {
          return a.isStandalone ? -1 : 1;
        }
        return a.isStandalone ? 1 : -1;
      }
      if (a.label !== b.label) {
        return a.label.localeCompare(b.label);
      }
      return a.key.localeCompare(b.key);
    });

  return groups;
}

export function formatServerDetails(server: ServerProfile, connection: ServerConnection | undefined): string {
  const vmDetails = [server.vmHost, server.vmType, server.vmName || server.vmId].filter(Boolean).join(" • ");

  if (!connection) {
    return [
      "Status: disconnected",
      vmDetails ? `VM: ${vmDetails}` : null,
      `URL: ${server.baseUrl || "not set"}`,
      "Sessions: 0",
    ]
      .filter(Boolean)
      .join("\n");
  }

  const latency = connection.health.latencyMs === null ? "n/a" : `${connection.health.latencyMs} ms`;
  return [
    `Status: ${connection.status}`,
    vmDetails ? `VM: ${vmDetails}` : null,
    `Sessions: ${connection.openSessions.length} open / ${connection.allSessions.length} total`,
    `Streams: ${connection.activeStreamCount}`,
    `Latency: ${latency}`,
  ]
    .filter(Boolean)
    .join("\n");
}

type BuildServerSwitcherMenuActionsArgs = {
  onReconnect: () => void;
  onViewDetails: () => void;
  onEditServer: () => void;
};

export function buildServerSwitcherMenuActions({
  onReconnect,
  onViewDetails,
  onEditServer,
}: BuildServerSwitcherMenuActionsArgs): ServerSwitcherMenuAction[] {
  return [
    { text: "Reconnect", onPress: onReconnect },
    { text: "View Details", onPress: onViewDetails },
    { text: "Edit Server", onPress: onEditServer },
    { text: "Cancel", style: "cancel" },
  ];
}

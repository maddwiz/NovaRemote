import { ServerConnection, ServerProfile } from "./types";

export type FleetApiPathDetector = (server: ServerProfile) => Promise<"/tmux" | "/terminal">;

type ResolveFleetTerminalApiBasePathArgs = {
  server: ServerProfile;
  connections: Map<string, ServerConnection>;
  detectApiBasePath: FleetApiPathDetector;
};

type ResolveFleetShellRunSupportArgs = {
  serverId: string;
  connections: Map<string, ServerConnection>;
};

export async function resolveFleetTerminalApiBasePath({
  server,
  connections,
  detectApiBasePath,
}: ResolveFleetTerminalApiBasePathArgs): Promise<"/tmux" | "/terminal"> {
  const pooled = connections.get(server.id);
  if (pooled?.terminalApiBasePath) {
    return pooled.terminalApiBasePath;
  }
  return await detectApiBasePath(server);
}

export function shouldAttemptFleetShellRun({ serverId, connections }: ResolveFleetShellRunSupportArgs): boolean {
  const pooled = connections.get(serverId);
  if (!pooled) {
    return true;
  }
  if (pooled.capabilitiesLoading) {
    return true;
  }
  return pooled.capabilities.shellRun;
}

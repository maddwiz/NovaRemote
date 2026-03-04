import { ServerConnection, ServerProfile } from "./types";

export type FleetApiPathDetector = (server: ServerProfile) => Promise<"/tmux" | "/terminal">;

type ResolveFleetTerminalApiBasePathArgs = {
  server: ServerProfile;
  connections: Map<string, ServerConnection>;
  detectApiBasePath: FleetApiPathDetector;
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

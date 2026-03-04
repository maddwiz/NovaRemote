import { SpatialPanel } from "./components/SpatialTerminalLayout";

export type SpatialPanelCandidate = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
  output: string;
  draft: string;
  sending: boolean;
  readOnly: boolean;
};

export function normalizePanelOrder(
  a: SpatialPanelCandidate,
  b: SpatialPanelCandidate,
  focusedServerId: string | null
): number {
  if (focusedServerId) {
    const aFocused = a.serverId === focusedServerId ? 1 : 0;
    const bFocused = b.serverId === focusedServerId ? 1 : 0;
    if (aFocused !== bFocused) {
      return bFocused - aFocused;
    }
  }
  if (a.serverName !== b.serverName) {
    return a.serverName.localeCompare(b.serverName);
  }
  return a.session.localeCompare(b.session);
}

export function cyclicalIndex(index: number, size: number): number {
  if (size <= 0) {
    return 0;
  }
  return ((index % size) + size) % size;
}

export function ensurePanelVisible(
  panelIds: string[],
  pinnedPanelIds: string[],
  targetPanelId: string,
  maxPanels: number
): string[] {
  const limit = Math.max(1, maxPanels);
  const uniquePanelIds = Array.from(new Set(panelIds.filter(Boolean)));
  const clamped = uniquePanelIds.slice(0, limit);

  if (!targetPanelId) {
    return clamped;
  }
  if (clamped.includes(targetPanelId)) {
    return clamped;
  }
  if (clamped.length < limit) {
    return [...clamped, targetPanelId];
  }

  const pinnedSet = new Set(pinnedPanelIds);
  const pinned = clamped.filter((panelId) => pinnedSet.has(panelId) && panelId !== targetPanelId);
  if (pinned.length >= limit) {
    return clamped;
  }

  const unpinned = clamped.filter((panelId) => !pinnedSet.has(panelId) && panelId !== targetPanelId);
  return [...pinned, targetPanelId, ...unpinned].slice(0, limit);
}

export function buildSpatialPanels(
  allPanels: SpatialPanelCandidate[],
  focusedPanelId: string | null,
  panelIds: string[],
  pinnedPanelIds: string[],
  overviewMode: boolean
): SpatialPanel[] {
  if (panelIds.length === 0) {
    return [];
  }

  const panelMap = new Map(allPanels.map((panel) => [panel.id, panel]));
  const focusId = focusedPanelId && panelIds.includes(focusedPanelId) ? focusedPanelId : panelIds[0];
  const ordered = [focusId, ...panelIds.filter((panelId) => panelId !== focusId)]
    .map((panelId) => panelMap.get(panelId))
    .filter(Boolean) as SpatialPanelCandidate[];

  const positions: Array<SpatialPanel["position"]> = overviewMode
    ? ["center", "left", "right", "above", "below"]
    : ["center"];

  return ordered.slice(0, positions.length).map((panel, index) => ({
    id: panel.id,
    serverId: panel.serverId,
    serverName: panel.serverName,
    session: panel.session,
    sessionLabel: panel.sessionLabel,
    position: positions[index],
    pinned: pinnedPanelIds.includes(panel.id),
    focused: panel.id === focusId,
    output: panel.output,
  }));
}

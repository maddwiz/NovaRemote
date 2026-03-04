import { useCallback, useEffect, useMemo, useState } from "react";

import { ServerConnection } from "../types";
import { VrLayoutPreset, VrPanelState } from "./contracts";
import { buildPresetLayout } from "./layoutPresets";
import { parseVrVoiceIntent, VrRoutePanel } from "./voiceRouting";

export type VrWorkspacePanel = VrPanelState & {
  output: string;
  connected: boolean;
};

export type VrWorkspaceVoiceAction =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "rotate_workspace"; direction: "left" | "right" }
  | { kind: "overview" }
  | {
      kind: "send";
      panelId: string;
      serverId: string;
      session: string;
      command: string;
    };

export type UseVrWorkspaceArgs = {
  connections: Map<string, ServerConnection>;
  maxPanels?: number;
  initialPreset?: VrLayoutPreset;
};

export type UseVrWorkspaceResult = {
  preset: VrLayoutPreset;
  panels: VrWorkspacePanel[];
  focusedPanelId: string | null;
  setPreset: (preset: VrLayoutPreset) => void;
  focusPanel: (panelId: string) => void;
  rotateWorkspace: (direction: "left" | "right") => void;
  addPanel: (serverId: string, session: string) => void;
  removePanel: (panelId: string) => void;
  applyVoiceTranscript: (transcript: string) => VrWorkspaceVoiceAction;
};

type UniversePanel = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
  output: string;
  connected: boolean;
};

const DEFAULT_MAX_PANELS = 6;
const DEFAULT_PRESET: VrLayoutPreset = "arc";

export function buildVrPanelId(serverId: string, session: string): string {
  return `${serverId}::${session}`;
}

function defaultPanelState(panel: UniversePanel): VrPanelState {
  return {
    id: panel.id,
    serverId: panel.serverId,
    serverName: panel.serverName,
    session: panel.session,
    sessionLabel: panel.sessionLabel,
    transform: {
      x: 0,
      y: 1.45,
      z: -1.8,
      yaw: 0,
      width: 1.05,
      height: 0.62,
    },
  };
}

function rotateOrder(ids: string[], direction: "left" | "right"): string[] {
  if (ids.length <= 1) {
    return ids;
  }
  if (direction === "left") {
    return [...ids.slice(1), ids[0]];
  }
  return [ids[ids.length - 1], ...ids.slice(0, -1)];
}

export function useVrWorkspace({
  connections,
  maxPanels = DEFAULT_MAX_PANELS,
  initialPreset = DEFAULT_PRESET,
}: UseVrWorkspaceArgs): UseVrWorkspaceResult {
  const panelLimit = Math.max(1, Math.min(maxPanels, 12));
  const [preset, setPreset] = useState<VrLayoutPreset>(initialPreset);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);

  const universe = useMemo(() => {
    const next: UniversePanel[] = [];
    connections.forEach((connection, serverId) => {
      const sessions = connection.openSessions.length > 0 ? connection.openSessions : connection.allSessions;
      sessions.forEach((session) => {
        next.push({
          id: buildVrPanelId(serverId, session),
          serverId,
          serverName: connection.server.name,
          session,
          sessionLabel: session,
          output: connection.tails[session] || "",
          connected: connection.connected,
        });
      });
    });
    return next;
  }, [connections]);

  const universeById = useMemo(() => {
    return new Map(universe.map((panel) => [panel.id, panel]));
  }, [universe]);

  useEffect(() => {
    const availableIds = universe.map((panel) => panel.id);
    const availableSet = new Set(availableIds);

    setPanelIds((prev) => {
      const kept = prev.filter((panelId) => availableSet.has(panelId));
      const appended = availableIds.filter((panelId) => !kept.includes(panelId));
      const merged = [...kept, ...appended].slice(0, panelLimit);
      if (merged.length === prev.length && merged.every((id, index) => id === prev[index])) {
        return prev;
      }
      return merged;
    });

    setFocusedPanelId((prev) => {
      if (prev && availableSet.has(prev)) {
        return prev;
      }
      return availableIds[0] || null;
    });
  }, [panelLimit, universe]);

  const panels = useMemo(() => {
    const basePanels = panelIds
      .map((panelId) => universeById.get(panelId))
      .filter((panel): panel is UniversePanel => Boolean(panel))
      .map((panel) => defaultPanelState(panel));

    const laidOut = buildPresetLayout(preset, basePanels);
    return laidOut
      .map((panel) => {
        const source = universeById.get(panel.id);
        if (!source) {
          return null;
        }
        return {
          ...panel,
          output: source.output,
          connected: source.connected,
        };
      })
      .filter((panel): panel is VrWorkspacePanel => Boolean(panel));
  }, [panelIds, preset, universeById]);

  const routePanels = useMemo<VrRoutePanel[]>(
    () =>
      panels.map((panel) => ({
        id: panel.id,
        serverId: panel.serverId,
        serverName: panel.serverName,
        session: panel.session,
        sessionLabel: panel.sessionLabel,
      })),
    [panels]
  );

  const focusPanel = useCallback((panelId: string) => {
    if (!panelId) {
      return;
    }
    setFocusedPanelId(panelId);
  }, []);

  const rotateWorkspace = useCallback((direction: "left" | "right") => {
    setPanelIds((prev) => rotateOrder(prev, direction));
  }, []);

  const addPanel = useCallback(
    (serverId: string, session: string) => {
      const panelId = buildVrPanelId(serverId, session);
      if (!universeById.has(panelId)) {
        return;
      }
      setPanelIds((prev) => {
        if (prev.includes(panelId)) {
          return prev;
        }
        const next = [...prev, panelId];
        if (next.length <= panelLimit) {
          return next;
        }
        return next.slice(next.length - panelLimit);
      });
      setFocusedPanelId(panelId);
    },
    [panelLimit, universeById]
  );

  const removePanel = useCallback((panelId: string) => {
    setPanelIds((prev) => prev.filter((id) => id !== panelId));
    setFocusedPanelId((prev) => (prev === panelId ? null : prev));
  }, []);

  const applyVoiceTranscript = useCallback(
    (transcript: string): VrWorkspaceVoiceAction => {
      const intent = parseVrVoiceIntent(transcript, routePanels, focusedPanelId);
      if (intent.kind === "focus") {
        focusPanel(intent.panelId);
        return { kind: "focus", panelId: intent.panelId };
      }
      if (intent.kind === "rotate_workspace") {
        rotateWorkspace(intent.direction);
        return { kind: "rotate_workspace", direction: intent.direction };
      }
      if (intent.kind === "overview") {
        return { kind: "overview" };
      }
      if (intent.kind === "send") {
        const panel = universeById.get(intent.panelId);
        if (!panel) {
          return { kind: "none" };
        }
        return {
          kind: "send",
          panelId: panel.id,
          serverId: panel.serverId,
          session: panel.session,
          command: intent.command,
        };
      }
      return { kind: "none" };
    },
    [focusPanel, focusedPanelId, rotateWorkspace, routePanels, universeById]
  );

  return {
    preset,
    panels,
    focusedPanelId,
    setPreset,
    focusPanel,
    rotateWorkspace,
    addPanel,
    removePanel,
    applyVoiceTranscript,
  };
}

export const vrWorkspaceTestUtils = {
  rotateOrder,
};

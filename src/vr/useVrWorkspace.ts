import { useCallback, useEffect, useMemo, useState } from "react";

import { ServerConnection } from "../types";
import {
  VR_PROTOCOL_VERSION,
  VrLayoutPreset,
  VrPanelState,
  VrPanelTransform,
  VrWorkspaceSnapshot,
} from "./contracts";
import { resolveVrGestureAction, VrGestureAction, VrGestureEvent } from "./inputGestures";
import { buildPresetLayout } from "./layoutPresets";
import { useVrWorkspacePrefs } from "./useVrWorkspacePrefs";
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
  | { kind: "minimize" }
  | {
      kind: "send";
      panelId: string;
      serverId: string;
      session: string;
      command: string;
    };

export type VrWorkspaceGestureAction = VrGestureAction;

export type UseVrWorkspaceArgs = {
  connections: Map<string, ServerConnection>;
  maxPanels?: number;
  initialPreset?: VrLayoutPreset;
};

export type UseVrWorkspaceResult = {
  preset: VrLayoutPreset;
  panels: VrWorkspacePanel[];
  focusedPanelId: string | null;
  overviewMode: boolean;
  setPreset: (preset: VrLayoutPreset) => void;
  setOverviewMode: (enabled: boolean) => void;
  focusPanel: (panelId: string) => void;
  rotateWorkspace: (direction: "left" | "right") => void;
  addPanel: (serverId: string, session: string) => void;
  removePanel: (panelId: string) => void;
  togglePinPanel: (panelId: string) => void;
  updatePanelTransform: (panelId: string, patch: Partial<VrPanelTransform>) => void;
  exportSnapshot: () => VrWorkspaceSnapshot;
  restoreSnapshot: (snapshot: VrWorkspaceSnapshot | null | undefined) => void;
  applyGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
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

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    if (!value || seen.has(value)) {
      return;
    }
    seen.add(value);
    next.push(value);
  });
  return next;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function sanitizeTransform(value: unknown): VrPanelTransform | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<VrPanelTransform>;
  if (!isFiniteNumber(parsed.x) || !isFiniteNumber(parsed.y) || !isFiniteNumber(parsed.z) || !isFiniteNumber(parsed.yaw)) {
    return null;
  }
  const next: VrPanelTransform = {
    x: parsed.x,
    y: parsed.y,
    z: parsed.z,
    yaw: parsed.yaw,
  };
  if (isFiniteNumber(parsed.pitch)) {
    next.pitch = parsed.pitch;
  }
  if (isFiniteNumber(parsed.roll)) {
    next.roll = parsed.roll;
  }
  if (isFiniteNumber(parsed.width)) {
    next.width = parsed.width;
  }
  if (isFiniteNumber(parsed.height)) {
    next.height = parsed.height;
  }
  if (isFiniteNumber(parsed.index)) {
    next.index = parsed.index;
  }
  return next;
}

function sanitizeTransformsByPanelId(
  transforms: unknown,
  allowedPanelIds: Set<string>
): Record<string, VrPanelTransform> {
  if (!transforms || typeof transforms !== "object") {
    return {};
  }
  const next: Record<string, VrPanelTransform> = {};
  Object.entries(transforms as Record<string, unknown>).forEach(([panelId, value]) => {
    if (!allowedPanelIds.has(panelId)) {
      return;
    }
    const transform = sanitizeTransform(value);
    if (!transform) {
      return;
    }
    next[panelId] = transform;
  });
  return next;
}

function isVrLayoutPreset(value: unknown): value is VrLayoutPreset {
  return value === "arc" || value === "grid" || value === "stacked" || value === "cockpit" || value === "custom";
}

export function useVrWorkspace({
  connections,
  maxPanels = DEFAULT_MAX_PANELS,
  initialPreset = DEFAULT_PRESET,
}: UseVrWorkspaceArgs): UseVrWorkspaceResult {
  const panelLimit = Math.max(1, Math.min(maxPanels, 12));
  const [preset, setPreset] = useState<VrLayoutPreset>(initialPreset);
  const [overviewMode, setOverviewMode] = useState<boolean>(false);
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [pinnedPanelIds, setPinnedPanelIds] = useState<string[]>([]);
  const [customTransforms, setCustomTransforms] = useState<Record<string, VrPanelTransform>>({});
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
  const panelUniverseIds = useMemo(() => universe.map((panel) => panel.id), [universe]);
  const serverScopeIds = useMemo(() => Array.from(connections.keys()), [connections]);

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

    setPinnedPanelIds((prev) => {
      const filtered = prev.filter((panelId) => availableSet.has(panelId));
      if (filtered.length === prev.length && filtered.every((panelId, index) => panelId === prev[index])) {
        return prev;
      }
      return filtered;
    });

    setCustomTransforms((prev) => {
      const filtered = Object.entries(prev).filter(([panelId]) => availableSet.has(panelId));
      if (filtered.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(filtered);
    });
  }, [panelLimit, universe]);

  const panels = useMemo(() => {
    const pinnedSet = new Set(pinnedPanelIds);
    const basePanels = panelIds
      .map((panelId) => universeById.get(panelId))
      .filter((panel): panel is UniversePanel => Boolean(panel))
      .map((panel) => {
        const base = defaultPanelState(panel);
        const customTransform = customTransforms[panel.id];
        return {
          ...base,
          pinned: pinnedSet.has(panel.id),
          transform: customTransform ? { ...base.transform, ...customTransform } : base.transform,
        };
      });

    const activePreset: VrLayoutPreset = overviewMode ? "grid" : preset;
    const laidOut = activePreset === "custom" ? basePanels : buildPresetLayout(activePreset, basePanels);
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
  }, [customTransforms, overviewMode, panelIds, pinnedPanelIds, preset, universeById]);

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
    setPinnedPanelIds((prev) => prev.filter((id) => id !== panelId));
    setCustomTransforms((prev) => {
      if (!(panelId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[panelId];
      return next;
    });
    setFocusedPanelId((prev) => (prev === panelId ? null : prev));
  }, []);

  const togglePinPanel = useCallback((panelId: string) => {
    setPinnedPanelIds((prev) => {
      if (prev.includes(panelId)) {
        return prev.filter((id) => id !== panelId);
      }
      return [...prev, panelId];
    });
  }, []);

  const updatePanelTransform = useCallback(
    (panelId: string, patch: Partial<VrPanelTransform>) => {
      if (!panelId || !universeById.has(panelId)) {
        return;
      }
      const panel = panels.find((entry) => entry.id === panelId);
      if (!panel) {
        return;
      }

      const nextPatch: Partial<VrPanelTransform> = {};
      if (isFiniteNumber(patch.x)) {
        nextPatch.x = patch.x;
      }
      if (isFiniteNumber(patch.y)) {
        nextPatch.y = patch.y;
      }
      if (isFiniteNumber(patch.z)) {
        nextPatch.z = patch.z;
      }
      if (isFiniteNumber(patch.yaw)) {
        nextPatch.yaw = patch.yaw;
      }
      if (isFiniteNumber(patch.pitch)) {
        nextPatch.pitch = patch.pitch;
      }
      if (isFiniteNumber(patch.roll)) {
        nextPatch.roll = patch.roll;
      }
      if (isFiniteNumber(patch.width)) {
        nextPatch.width = patch.width;
      }
      if (isFiniteNumber(patch.height)) {
        nextPatch.height = patch.height;
      }
      if (isFiniteNumber(patch.index)) {
        nextPatch.index = patch.index;
      }

      if (Object.keys(nextPatch).length === 0) {
        return;
      }

      setCustomTransforms((prev) => ({
        ...prev,
        [panelId]: {
          ...panel.transform,
          ...prev[panelId],
          ...nextPatch,
        },
      }));
      setPreset("custom");
    },
    [panels, universeById]
  );

  const exportSnapshot = useCallback((): VrWorkspaceSnapshot => {
    const activePanelIds = new Set(panelIds);
    const persistedTransforms = sanitizeTransformsByPanelId(customTransforms, activePanelIds);
    return {
      version: VR_PROTOCOL_VERSION,
      preset,
      focusedPanelId,
      panelIds: panelIds.slice(),
      pinnedPanelIds: pinnedPanelIds.filter((panelId) => activePanelIds.has(panelId)),
      customTransforms: Object.keys(persistedTransforms).length > 0 ? persistedTransforms : undefined,
      overviewMode,
    };
  }, [customTransforms, focusedPanelId, overviewMode, panelIds, pinnedPanelIds, preset]);

  const restoreSnapshot = useCallback(
    (snapshot: VrWorkspaceSnapshot | null | undefined) => {
      if (!snapshot) {
        return;
      }

      const availableIds = universe.map((panel) => panel.id);
      const availableSet = new Set(availableIds);

      const restoredPanelIds = uniqueOrdered(
        (Array.isArray(snapshot.panelIds) ? snapshot.panelIds : []).filter((panelId) => availableSet.has(panelId))
      );
      const nextPanelIds = restoredPanelIds.length > 0 ? restoredPanelIds.slice(0, panelLimit) : availableIds.slice(0, panelLimit);

      const nextFocusedPanelId =
        typeof snapshot.focusedPanelId === "string" && nextPanelIds.includes(snapshot.focusedPanelId)
          ? snapshot.focusedPanelId
          : nextPanelIds[0] || null;

      const nextPinnedPanelIds = uniqueOrdered(
        (Array.isArray(snapshot.pinnedPanelIds) ? snapshot.pinnedPanelIds : []).filter((panelId) =>
          nextPanelIds.includes(panelId)
        )
      );

      const nextPreset = isVrLayoutPreset(snapshot.preset) ? snapshot.preset : DEFAULT_PRESET;
      const nextCustomTransforms = sanitizeTransformsByPanelId(snapshot.customTransforms, new Set(nextPanelIds));

      setPreset(nextPreset);
      setOverviewMode(Boolean(snapshot.overviewMode));
      setPanelIds(nextPanelIds);
      setFocusedPanelId(nextFocusedPanelId);
      setPinnedPanelIds(nextPinnedPanelIds);
      setCustomTransforms(nextCustomTransforms);
    },
    [panelLimit, universe]
  );

  const workspaceSnapshot = useMemo(() => exportSnapshot(), [exportSnapshot]);

  useVrWorkspacePrefs({
    serverScopeIds,
    panelUniverseIds,
    maxPanels: panelLimit,
    value: workspaceSnapshot,
    onRestore: restoreSnapshot,
  });

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
        setOverviewMode(true);
        return { kind: "overview" };
      }
      if (intent.kind === "minimize") {
        setOverviewMode(false);
        return { kind: "minimize" };
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

  const applyGesture = useCallback(
    (event: VrGestureEvent): VrWorkspaceGestureAction => {
      const action = resolveVrGestureAction({
        event,
        panels,
        focusedPanelId,
      });

      if (action.kind === "focus") {
        focusPanel(action.panelId);
        return action;
      }
      if (action.kind === "move") {
        updatePanelTransform(action.panelId, action.patch);
        return action;
      }
      if (action.kind === "resize") {
        updatePanelTransform(action.panelId, action.patch);
        return action;
      }
      if (action.kind === "rotate_workspace") {
        rotateWorkspace(action.direction);
        return action;
      }
      if (action.kind === "overview") {
        setOverviewMode(true);
        return action;
      }
      return action;
    },
    [focusPanel, focusedPanelId, panels, rotateWorkspace, updatePanelTransform]
  );

  return {
    preset,
    panels,
    focusedPanelId,
    overviewMode,
    setPreset,
    setOverviewMode,
    focusPanel,
    rotateWorkspace,
    addPanel,
    removePanel,
    togglePinPanel,
    updatePanelTransform,
    exportSnapshot,
    restoreSnapshot,
    applyGesture,
    applyVoiceTranscript,
  };
}

export const vrWorkspaceTestUtils = {
  uniqueOrdered,
  sanitizeTransform,
  rotateOrder,
};

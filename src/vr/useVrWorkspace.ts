import { useCallback, useEffect, useMemo, useState } from "react";

import { ServerConnection } from "../types";
import {
  VR_PROTOCOL_VERSION,
  VrLayoutPreset,
  VrPanelVisualState,
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
  | { kind: "reconnect_server"; panelId: string; serverId: string }
  | { kind: "reconnect_all"; serverIds: string[] }
  | { kind: "create_agent"; serverIds: string[]; name: string }
  | { kind: "set_agent_goal"; serverIds: string[]; name: string; goal: string }
  | { kind: "approve_ready_agents"; serverIds: string[] }
  | { kind: "deny_all_pending_agents"; serverIds: string[] }
  | { kind: "pause_pool" }
  | { kind: "resume_pool" }
  | { kind: "rotate_workspace"; direction: "left" | "right" }
  | {
      kind: "stop_session";
      panelId: string;
      serverId: string;
      session: string;
    }
  | {
      kind: "open_on_mac";
      panelId: string;
      serverId: string;
      session: string;
    }
  | {
      kind: "control";
      panelId: string;
      serverId: string;
      session: string;
      char: string;
    }
  | { kind: "overview" }
  | { kind: "minimize" }
  | { kind: "layout_preset"; preset: Exclude<VrLayoutPreset, "custom"> }
  | { kind: "panel_mini"; panelId: string }
  | { kind: "panel_expand"; panelId: string }
  | { kind: "panel_opacity"; panelId: string; opacity: number }
  | {
      kind: "send";
      panelId: string;
      serverId: string;
      session: string;
      command: string;
    };

export type VrWorkspaceGestureAction = VrGestureAction;

export type VrVoiceDispatchOptions = {
  targetPanelId?: string | null;
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
  overviewMode: boolean;
  setPreset: (preset: VrLayoutPreset) => void;
  setOverviewMode: (enabled: boolean) => void;
  focusPanel: (panelId: string) => void;
  rotateWorkspace: (direction: "left" | "right") => void;
  addPanel: (serverId: string, session: string) => void;
  removePanel: (panelId: string) => void;
  togglePinPanel: (panelId: string) => void;
  setPanelMini: (panelId: string, mini: boolean) => void;
  toggleMiniPanel: (panelId: string) => void;
  setPanelOpacity: (panelId: string, opacity: number) => void;
  updatePanelTransform: (panelId: string, patch: Partial<VrPanelTransform>) => void;
  exportSnapshot: () => VrWorkspaceSnapshot;
  restoreSnapshot: (snapshot: VrWorkspaceSnapshot | null | undefined) => void;
  applyGesture: (event: VrGestureEvent) => VrWorkspaceGestureAction;
  applyVoiceTranscript: (transcript: string, options?: VrVoiceDispatchOptions) => VrWorkspaceVoiceAction;
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

function applyPanelLimit(
  panelIds: string[],
  pinnedPanelIds: string[],
  panelLimit: number,
  preferredPanelId?: string
): string[] {
  const ordered = uniqueOrdered(panelIds);
  if (ordered.length <= panelLimit) {
    return ordered;
  }

  const pinnedSet = new Set(pinnedPanelIds);
  const pinned = ordered.filter((panelId) => pinnedSet.has(panelId));
  const unpinned = ordered.filter((panelId) => !pinnedSet.has(panelId));
  if (preferredPanelId && !pinnedSet.has(preferredPanelId)) {
    const preferredIndex = unpinned.indexOf(preferredPanelId);
    if (preferredIndex > 0) {
      unpinned.splice(preferredIndex, 1);
      unpinned.unshift(preferredPanelId);
    }
  }
  if (pinned.length >= panelLimit) {
    return pinned.slice(0, panelLimit);
  }
  return [...pinned, ...unpinned.slice(0, panelLimit - pinned.length)];
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizePanelVisual(value: unknown): VrPanelVisualState | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<VrPanelVisualState>;
  const next: VrPanelVisualState = {};
  if (typeof parsed.mini === "boolean") {
    next.mini = parsed.mini;
  }
  if (isFiniteNumber(parsed.opacity)) {
    next.opacity = clamp(parsed.opacity, 0.2, 1);
  }
  return Object.keys(next).length > 0 ? next : null;
}

function sanitizePanelVisualsByPanelId(
  panelVisuals: unknown,
  allowedPanelIds: Set<string>
): Record<string, VrPanelVisualState> {
  if (!panelVisuals || typeof panelVisuals !== "object") {
    return {};
  }
  const next: Record<string, VrPanelVisualState> = {};
  Object.entries(panelVisuals as Record<string, unknown>).forEach(([panelId, value]) => {
    if (!allowedPanelIds.has(panelId)) {
      return;
    }
    const visual = sanitizePanelVisual(value);
    if (!visual) {
      return;
    }
    next[panelId] = visual;
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
  const [panelVisuals, setPanelVisuals] = useState<Record<string, VrPanelVisualState>>({});
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
    const nextPinnedForLimit = pinnedPanelIds.filter((panelId) => availableSet.has(panelId));

    setPanelIds((prev) => {
      const kept = prev.filter((panelId) => availableSet.has(panelId));
      const appended = availableIds.filter((panelId) => !kept.includes(panelId));
      const merged = applyPanelLimit([...kept, ...appended], nextPinnedForLimit, panelLimit);
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

    setPanelVisuals((prev) => {
      const filtered = Object.entries(prev).filter(([panelId]) => availableSet.has(panelId));
      if (filtered.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(filtered);
    });
  }, [panelLimit, pinnedPanelIds, universe]);

  const panels = useMemo(() => {
    const pinnedSet = new Set(pinnedPanelIds);
    const basePanels = panelIds
      .map((panelId) => universeById.get(panelId))
      .filter((panel): panel is UniversePanel => Boolean(panel))
      .map((panel) => {
        const base = defaultPanelState(panel);
        const customTransform = customTransforms[panel.id];
        const visual = panelVisuals[panel.id];
        return {
          ...base,
          pinned: pinnedSet.has(panel.id),
          mini: Boolean(visual?.mini),
          opacity: visual?.opacity ?? 1,
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
  }, [customTransforms, overviewMode, panelIds, panelVisuals, pinnedPanelIds, preset, universeById]);

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
        return applyPanelLimit(next, pinnedPanelIds, panelLimit, panelId);
      });
      setFocusedPanelId(panelId);
    },
    [panelLimit, pinnedPanelIds, universeById]
  );

  const removePanel = useCallback((panelId: string) => {
    setPanelIds((prev) => prev.filter((id) => id !== panelId));
    setPinnedPanelIds((prev) => prev.filter((id) => id !== panelId));
    setPanelVisuals((prev) => {
      if (!(panelId in prev)) {
        return prev;
      }
      const next = { ...prev };
      delete next[panelId];
      return next;
    });
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

  const toggleMiniPanel = useCallback(
    (panelId: string) => {
      if (!panelId || !universeById.has(panelId)) {
        return;
      }
      setPanelVisuals((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          mini: !Boolean(prev[panelId]?.mini),
        },
      }));
    },
    [universeById]
  );

  const setPanelMini = useCallback(
    (panelId: string, mini: boolean) => {
      if (!panelId || !universeById.has(panelId)) {
        return;
      }
      setPanelVisuals((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          mini,
        },
      }));
    },
    [universeById]
  );

  const setPanelOpacity = useCallback(
    (panelId: string, opacity: number) => {
      if (!panelId || !universeById.has(panelId) || !isFiniteNumber(opacity)) {
        return;
      }
      const clamped = clamp(opacity, 0.2, 1);
      setPanelVisuals((prev) => ({
        ...prev,
        [panelId]: {
          ...prev[panelId],
          opacity: clamped,
        },
      }));
    },
    [universeById]
  );

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
    const persistedPanelVisuals = sanitizePanelVisualsByPanelId(panelVisuals, activePanelIds);
    return {
      version: VR_PROTOCOL_VERSION,
      preset,
      focusedPanelId,
      panelIds: panelIds.slice(),
      pinnedPanelIds: pinnedPanelIds.filter((panelId) => activePanelIds.has(panelId)),
      panelVisuals: Object.keys(persistedPanelVisuals).length > 0 ? persistedPanelVisuals : undefined,
      customTransforms: Object.keys(persistedTransforms).length > 0 ? persistedTransforms : undefined,
      overviewMode,
    };
  }, [customTransforms, focusedPanelId, overviewMode, panelIds, panelVisuals, pinnedPanelIds, preset]);

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
      const requestedPinnedPanelIds = uniqueOrdered(
        (Array.isArray(snapshot.pinnedPanelIds) ? snapshot.pinnedPanelIds : []).filter((panelId) =>
          restoredPanelIds.includes(panelId) || availableIds.includes(panelId)
        )
      );
      const nextPanelIds = restoredPanelIds.length > 0
        ? applyPanelLimit(restoredPanelIds, requestedPinnedPanelIds, panelLimit)
        : applyPanelLimit(availableIds, requestedPinnedPanelIds, panelLimit);

      const nextFocusedPanelId =
        typeof snapshot.focusedPanelId === "string" && nextPanelIds.includes(snapshot.focusedPanelId)
          ? snapshot.focusedPanelId
          : nextPanelIds[0] || null;

      const nextPinnedPanelIds = uniqueOrdered(
        requestedPinnedPanelIds.filter((panelId) => nextPanelIds.includes(panelId))
      );

      const nextPreset = isVrLayoutPreset(snapshot.preset) ? snapshot.preset : DEFAULT_PRESET;
      const nextCustomTransforms = sanitizeTransformsByPanelId(snapshot.customTransforms, new Set(nextPanelIds));
      const nextPanelVisuals = sanitizePanelVisualsByPanelId(snapshot.panelVisuals, new Set(nextPanelIds));

      setPreset(nextPreset);
      setOverviewMode(Boolean(snapshot.overviewMode));
      setPanelIds(nextPanelIds);
      setFocusedPanelId(nextFocusedPanelId);
      setPinnedPanelIds(nextPinnedPanelIds);
      setPanelVisuals(nextPanelVisuals);
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
    (transcript: string, options?: VrVoiceDispatchOptions): VrWorkspaceVoiceAction => {
      const targetedPanelId = options?.targetPanelId ?? null;
      const routingPanelId =
        targetedPanelId && universeById.has(targetedPanelId)
          ? targetedPanelId
          : focusedPanelId;
      const intent = parseVrVoiceIntent(transcript, routePanels, routingPanelId);
      const resolveTargetPanel = (panelId?: string): UniversePanel | null => {
        if (panelId) {
          return universeById.get(panelId) || null;
        }
        if (routingPanelId) {
          const fromRouting = universeById.get(routingPanelId);
          if (fromRouting) {
            return fromRouting;
          }
        }
        const firstPanel = routePanels[0];
        return firstPanel ? universeById.get(firstPanel.id) || null : null;
      };
      if (intent.kind === "focus") {
        focusPanel(intent.panelId);
        return { kind: "focus", panelId: intent.panelId };
      }
      if (intent.kind === "reconnect_server") {
        const panel = universeById.get(intent.panelId);
        if (!panel) {
          return { kind: "none" };
        }
        return {
          kind: "reconnect_server",
          panelId: panel.id,
          serverId: panel.serverId,
        };
      }
      if (intent.kind === "reconnect_all") {
        return {
          kind: "reconnect_all",
          serverIds: serverScopeIds.slice(),
        };
      }
      if (intent.kind === "create_agent") {
        const targetPanel = resolveTargetPanel(intent.panelId);
        const serverIds = intent.allServers ? serverScopeIds.slice() : targetPanel ? [targetPanel.serverId] : serverScopeIds.slice(0, 1);
        if (serverIds.length === 0) {
          return { kind: "none" };
        }
        return {
          kind: "create_agent",
          serverIds,
          name: intent.name,
        };
      }
      if (intent.kind === "set_agent_goal") {
        const targetPanel = resolveTargetPanel(intent.panelId);
        const serverIds = intent.allServers ? serverScopeIds.slice() : targetPanel ? [targetPanel.serverId] : serverScopeIds.slice(0, 1);
        if (serverIds.length === 0) {
          return { kind: "none" };
        }
        return {
          kind: "set_agent_goal",
          serverIds,
          name: intent.name,
          goal: intent.goal,
        };
      }
      if (intent.kind === "approve_ready_agents") {
        if (intent.panelId) {
          const targetPanel = universeById.get(intent.panelId);
          if (!targetPanel) {
            return { kind: "none" };
          }
          return {
            kind: "approve_ready_agents",
            serverIds: [targetPanel.serverId],
          };
        }
        return {
          kind: "approve_ready_agents",
          serverIds: serverScopeIds.slice(),
        };
      }
      if (intent.kind === "deny_all_pending_agents") {
        if (intent.panelId) {
          const targetPanel = universeById.get(intent.panelId);
          if (!targetPanel) {
            return { kind: "none" };
          }
          return {
            kind: "deny_all_pending_agents",
            serverIds: [targetPanel.serverId],
          };
        }
        return {
          kind: "deny_all_pending_agents",
          serverIds: serverScopeIds.slice(),
        };
      }
      if (intent.kind === "pause_pool") {
        return { kind: "pause_pool" };
      }
      if (intent.kind === "resume_pool") {
        return { kind: "resume_pool" };
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
      if (intent.kind === "layout_preset") {
        setPreset(intent.preset);
        return { kind: "layout_preset", preset: intent.preset };
      }
      if (intent.kind === "control") {
        const panel = universeById.get(intent.panelId);
        if (!panel) {
          return { kind: "none" };
        }
        return {
          kind: "control",
          panelId: panel.id,
          serverId: panel.serverId,
          session: panel.session,
          char: intent.char,
        };
      }
      if (intent.kind === "stop_session") {
        const panel = universeById.get(intent.panelId);
        if (!panel) {
          return { kind: "none" };
        }
        return {
          kind: "stop_session",
          panelId: panel.id,
          serverId: panel.serverId,
          session: panel.session,
        };
      }
      if (intent.kind === "open_on_mac") {
        const panel = universeById.get(intent.panelId);
        if (!panel) {
          return { kind: "none" };
        }
        return {
          kind: "open_on_mac",
          panelId: panel.id,
          serverId: panel.serverId,
          session: panel.session,
        };
      }
      if (intent.kind === "panel_mini") {
        setPanelMini(intent.panelId, true);
        return { kind: "panel_mini", panelId: intent.panelId };
      }
      if (intent.kind === "panel_expand") {
        setPanelMini(intent.panelId, false);
        return { kind: "panel_expand", panelId: intent.panelId };
      }
      if (intent.kind === "panel_opacity") {
        setPanelOpacity(intent.panelId, intent.opacity);
        return { kind: "panel_opacity", panelId: intent.panelId, opacity: intent.opacity };
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
    [focusPanel, focusedPanelId, rotateWorkspace, routePanels, serverScopeIds, setPanelMini, setPanelOpacity, universeById]
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
      if (action.kind === "snap_layout") {
        setPreset(action.preset);
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
    setPanelMini,
    toggleMiniPanel,
    setPanelOpacity,
    updatePanelTransform,
    exportSnapshot,
    restoreSnapshot,
    applyGesture,
    applyVoiceTranscript,
  };
}

export const vrWorkspaceTestUtils = {
  applyPanelLimit,
  sanitizePanelVisual,
  uniqueOrdered,
  sanitizeTransform,
  rotateOrder,
};

import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_VR_WORKSPACE_PREFIX } from "../constants";
import {
  VR_PROTOCOL_VERSION,
  VrLayoutPreset,
  VrPanelTransform,
  VrPanelVisualState,
  VrWorkspaceSnapshot,
} from "./contracts";

type UseVrWorkspacePrefsArgs = {
  serverScopeIds: string[];
  panelUniverseIds: string[];
  maxPanels: number;
  value: VrWorkspaceSnapshot;
  onRestore: (snapshot: VrWorkspaceSnapshot) => void;
};

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

function hashScope(value: string): string {
  let hash = 5381;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }
  return (hash >>> 0).toString(36);
}

function isVrLayoutPreset(value: unknown): value is VrLayoutPreset {
  return value === "arc" || value === "grid" || value === "stacked" || value === "cockpit" || value === "custom";
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sanitizePanelTransform(value: unknown): VrPanelTransform | null {
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

function sanitizeCustomTransforms(
  value: unknown,
  allowedPanelIds: Set<string>
): Record<string, VrPanelTransform> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next: Record<string, VrPanelTransform> = {};
  Object.entries(value as Record<string, unknown>).forEach(([panelId, transform]) => {
    if (!allowedPanelIds.has(panelId)) {
      return;
    }
    const normalized = sanitizePanelTransform(transform);
    if (!normalized) {
      return;
    }
    next[panelId] = normalized;
  });

  return Object.keys(next).length > 0 ? next : undefined;
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

function sanitizePanelVisuals(
  value: unknown,
  allowedPanelIds: Set<string>
): Record<string, VrPanelVisualState> | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }

  const next: Record<string, VrPanelVisualState> = {};
  Object.entries(value as Record<string, unknown>).forEach(([panelId, visual]) => {
    if (!allowedPanelIds.has(panelId)) {
      return;
    }
    const normalized = sanitizePanelVisual(visual);
    if (!normalized) {
      return;
    }
    next[panelId] = normalized;
  });

  return Object.keys(next).length > 0 ? next : undefined;
}

export function makeVrWorkspaceScope(serverScopeIds: string[]): string {
  const normalized = uniqueOrdered(serverScopeIds.map((entry) => entry.trim()).filter(Boolean)).sort();
  if (normalized.length === 0) {
    return "none";
  }
  return hashScope(normalized.join("|"));
}

export function makeVrWorkspaceStorageKey(serverScopeIds: string[]): string {
  return `${STORAGE_VR_WORKSPACE_PREFIX}.${makeVrWorkspaceScope(serverScopeIds)}`;
}

export function normalizeVrWorkspaceSnapshot(
  value: unknown,
  allowedPanelIds: string[],
  maxPanels: number
): VrWorkspaceSnapshot {
  const parsed = (value && typeof value === "object" ? value : {}) as Partial<VrWorkspaceSnapshot>;
  const allowed = new Set(allowedPanelIds);
  const hardLimit = Math.max(1, Math.min(maxPanels, 12));
  const fallbackPanelId = allowedPanelIds[0] || null;

  let panelIds = uniqueOrdered((Array.isArray(parsed.panelIds) ? parsed.panelIds : []).filter((panelId) => allowed.has(panelId)));
  if (panelIds.length > hardLimit) {
    panelIds = panelIds.slice(0, hardLimit);
  }
  if (panelIds.length === 0 && fallbackPanelId) {
    panelIds = [fallbackPanelId];
  }

  const panelSet = new Set(panelIds);
  const pinnedPanelIds = uniqueOrdered(
    (Array.isArray(parsed.pinnedPanelIds) ? parsed.pinnedPanelIds : []).filter((panelId) => panelSet.has(panelId))
  );

  const focusedPanelId =
    typeof parsed.focusedPanelId === "string" && panelSet.has(parsed.focusedPanelId)
      ? parsed.focusedPanelId
      : panelIds[0] || null;

  return {
    version: VR_PROTOCOL_VERSION,
    preset: isVrLayoutPreset(parsed.preset) ? parsed.preset : "arc",
    focusedPanelId,
    panelIds,
    pinnedPanelIds,
    overviewMode: Boolean(parsed.overviewMode),
    panelVisuals: sanitizePanelVisuals(parsed.panelVisuals, panelSet),
    customTransforms: sanitizeCustomTransforms(parsed.customTransforms, panelSet),
  };
}

export function useVrWorkspacePrefs({
  serverScopeIds,
  panelUniverseIds,
  maxPanels,
  value,
  onRestore,
}: UseVrWorkspacePrefsArgs) {
  const panelUniverseKey = useMemo(() => uniqueOrdered(panelUniverseIds).join("|"), [panelUniverseIds]);
  const stablePanelUniverseIds = useMemo(
    () => (panelUniverseKey ? panelUniverseKey.split("|") : []),
    [panelUniverseKey]
  );
  const key = useMemo(
    () => makeVrWorkspaceStorageKey(serverScopeIds),
    [serverScopeIds]
  );

  const restoreRef = useRef(onRestore);
  const loadedKeyRef = useRef<string | null>(null);
  const skipNextPersistKeyRef = useRef<string | null>(null);
  const [hydratedKey, setHydratedKey] = useState<string | null>(null);

  useEffect(() => {
    restoreRef.current = onRestore;
  }, [onRestore]);

  useEffect(() => {
    if (loadedKeyRef.current === key) {
      return;
    }
    loadedKeyRef.current = key;

    let cancelled = false;
    const load = async () => {
      let restoredFromStorage = false;
      try {
        const raw = await SecureStore.getItemAsync(key);
        if (cancelled) {
          return;
        }
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            const normalized = normalizeVrWorkspaceSnapshot(parsed, stablePanelUniverseIds, maxPanels);
            restoreRef.current(normalized);
            restoredFromStorage = true;
          } catch {
            // Ignore corrupt snapshots.
          }
        }
      } finally {
        if (!cancelled) {
          skipNextPersistKeyRef.current = restoredFromStorage ? key : null;
          setHydratedKey(key);
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [key, maxPanels, stablePanelUniverseIds]);

  const normalizedValue = useMemo(
    () => normalizeVrWorkspaceSnapshot(value, stablePanelUniverseIds, maxPanels),
    [maxPanels, stablePanelUniverseIds, value]
  );

  useEffect(() => {
    if (hydratedKey !== key) {
      return;
    }
    if (skipNextPersistKeyRef.current === key) {
      skipNextPersistKeyRef.current = null;
      return;
    }
    const payload = {
      ...normalizedValue,
      updatedAt: new Date().toISOString(),
    };
    void SecureStore.setItemAsync(key, JSON.stringify(payload)).catch(() => {});
  }, [hydratedKey, key, normalizedValue]);
}

export const vrWorkspacePrefsTestUtils = {
  hashScope,
  makeVrWorkspaceScope,
  makeVrWorkspaceStorageKey,
  sanitizePanelTransform,
  sanitizePanelVisual,
  normalizeVrWorkspaceSnapshot,
};

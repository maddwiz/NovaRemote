import * as SecureStore from "expo-secure-store";
import { useEffect, useMemo, useRef, useState } from "react";

import { STORAGE_SPATIAL_LAYOUT_PREFIX } from "../constants";
import { GlassesBrand } from "../types";

export type SpatialLayoutSnapshot = {
  panelIds: string[];
  pinnedPanelIds: string[];
  focusedPanelId: string | null;
  overviewMode: boolean;
};

type UseSpatialLayoutPrefsArgs = {
  brand: GlassesBrand;
  serverScopeIds: string[];
  panelUniverseIds: string[];
  maxPanels: number;
  value: SpatialLayoutSnapshot;
  onRestore: (snapshot: SpatialLayoutSnapshot) => void;
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

export function makeSpatialLayoutScope(serverScopeIds: string[]): string {
  const normalized = uniqueOrdered(serverScopeIds.map((entry) => entry.trim()).filter(Boolean)).sort();
  if (normalized.length === 0) {
    return "none";
  }
  return hashScope(normalized.join("|"));
}

export function makeSpatialLayoutStorageKey(brand: GlassesBrand, serverScopeIds: string[]): string {
  return `${STORAGE_SPATIAL_LAYOUT_PREFIX}.${brand}.${makeSpatialLayoutScope(serverScopeIds)}`;
}

export function normalizeSpatialLayoutSnapshot(
  value: unknown,
  allowedPanelIds: string[],
  maxPanels: number
): SpatialLayoutSnapshot {
  const parsed = (value && typeof value === "object" ? value : {}) as Partial<SpatialLayoutSnapshot>;
  const allowed = new Set(allowedPanelIds);
  const hardLimit = Math.max(1, Math.min(maxPanels, 6));
  const fallback = allowedPanelIds[0] || null;

  let panelIds = uniqueOrdered((Array.isArray(parsed.panelIds) ? parsed.panelIds : []).filter((id) => allowed.has(id)));
  if (panelIds.length > hardLimit) {
    panelIds = panelIds.slice(0, hardLimit);
  }
  if (panelIds.length === 0 && fallback) {
    panelIds = [fallback];
  }

  const pinnedPanelIds = uniqueOrdered(
    (Array.isArray(parsed.pinnedPanelIds) ? parsed.pinnedPanelIds : []).filter((id) => panelIds.includes(id))
  );
  const focusedPanelId =
    typeof parsed.focusedPanelId === "string" && panelIds.includes(parsed.focusedPanelId)
      ? parsed.focusedPanelId
      : panelIds[0] || null;

  return {
    panelIds,
    pinnedPanelIds,
    focusedPanelId,
    overviewMode: parsed.overviewMode !== undefined ? Boolean(parsed.overviewMode) : true,
  };
}

export function useSpatialLayoutPrefs({
  brand,
  serverScopeIds,
  panelUniverseIds,
  maxPanels,
  value,
  onRestore,
}: UseSpatialLayoutPrefsArgs) {
  const panelUniverseKey = useMemo(
    () => uniqueOrdered(panelUniverseIds).join("|"),
    [panelUniverseIds]
  );
  const stablePanelUniverseIds = useMemo(
    () => (panelUniverseKey ? panelUniverseKey.split("|") : []),
    [panelUniverseKey]
  );
  const key = useMemo(
    () => makeSpatialLayoutStorageKey(brand, serverScopeIds),
    [brand, serverScopeIds]
  );
  const restoreRef = useRef(onRestore);
  const loadedKeyRef = useRef<string | null>(null);
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
      try {
        const raw = await SecureStore.getItemAsync(key);
        if (cancelled) {
          return;
        }
        if (raw) {
          try {
            const parsed = JSON.parse(raw) as unknown;
            const normalized = normalizeSpatialLayoutSnapshot(parsed, stablePanelUniverseIds, maxPanels);
            restoreRef.current(normalized);
          } catch {
            // Ignore corrupt snapshots.
          }
        }
      } finally {
        if (!cancelled) {
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
    () => normalizeSpatialLayoutSnapshot(value, stablePanelUniverseIds, maxPanels),
    [maxPanels, stablePanelUniverseIds, value]
  );

  useEffect(() => {
    if (hydratedKey !== key) {
      return;
    }
    const payload = {
      ...normalizedValue,
      updatedAt: new Date().toISOString(),
    };
    void SecureStore.setItemAsync(key, JSON.stringify(payload)).catch(() => {});
  }, [hydratedKey, key, normalizedValue]);
}

export const spatialLayoutPrefsTestUtils = {
  hashScope,
  makeSpatialLayoutScope,
  makeSpatialLayoutStorageKey,
  normalizeSpatialLayoutSnapshot,
};

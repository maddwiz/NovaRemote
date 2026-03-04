import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_VM_GROUP_PREFS_PREFIX = "novaremote.vm_group_prefs.v1";

export type VmGroupPrefsScope = "rail" | "servers";

type VmGroupPrefsSnapshot = {
  collapsedGroupKeys: string[];
};

type UseVmGroupPrefsArgs = {
  scope: VmGroupPrefsScope;
  groupKeys: string[];
};

function uniqueOrdered(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      return;
    }
    seen.add(trimmed);
    next.push(trimmed);
  });
  return next;
}

export function makeVmGroupPrefsStorageKey(scope: VmGroupPrefsScope): string {
  return `${STORAGE_VM_GROUP_PREFS_PREFIX}.${scope}`;
}

export function normalizeVmGroupPrefsSnapshot(
  value: unknown,
  allowedGroupKeys: string[]
): VmGroupPrefsSnapshot {
  const parsed = (value && typeof value === "object" ? value : {}) as Partial<VmGroupPrefsSnapshot>;
  const allowed = new Set(uniqueOrdered(allowedGroupKeys));

  const collapsedGroupKeys = uniqueOrdered(Array.isArray(parsed.collapsedGroupKeys) ? parsed.collapsedGroupKeys : []).filter(
    (groupKey) => allowed.has(groupKey)
  );

  return {
    collapsedGroupKeys,
  };
}

export function useVmGroupPrefs({ scope, groupKeys }: UseVmGroupPrefsArgs) {
  const key = useMemo(() => makeVmGroupPrefsStorageKey(scope), [scope]);
  const groupKeySignature = useMemo(() => uniqueOrdered(groupKeys).join("|"), [groupKeys]);
  const stableGroupKeys = useMemo(
    () => (groupKeySignature ? groupKeySignature.split("|") : []),
    [groupKeySignature]
  );
  const [collapsedGroupKeys, setCollapsedGroupKeys] = useState<string[]>([]);
  const hydratedRef = useRef(false);

  useEffect(() => {
    hydratedRef.current = false;
    let cancelled = false;

    const load = async () => {
      try {
        const raw = await SecureStore.getItemAsync(key);
        if (cancelled || !raw) {
          return;
        }
        const parsed = JSON.parse(raw) as unknown;
        const normalized = normalizeVmGroupPrefsSnapshot(parsed, stableGroupKeys);
        setCollapsedGroupKeys(normalized.collapsedGroupKeys);
      } catch {
        // Ignore persistence errors.
      } finally {
        if (!cancelled) {
          hydratedRef.current = true;
        }
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [key, stableGroupKeys]);

  useEffect(() => {
    const allowed = new Set(stableGroupKeys);
    setCollapsedGroupKeys((previous) => {
      const filtered = previous.filter((groupKey) => allowed.has(groupKey));
      if (filtered.length === previous.length) {
        return previous;
      }
      return filtered;
    });
  }, [stableGroupKeys]);

  useEffect(() => {
    if (!hydratedRef.current) {
      return;
    }
    const payload: VmGroupPrefsSnapshot = {
      collapsedGroupKeys,
    };
    void SecureStore.setItemAsync(key, JSON.stringify(payload)).catch(() => {});
  }, [collapsedGroupKeys, key]);

  const collapsedGroupKeySet = useMemo(() => new Set(collapsedGroupKeys), [collapsedGroupKeys]);

  const isGroupCollapsed = useCallback(
    (groupKey: string) => {
      return collapsedGroupKeySet.has(groupKey.trim());
    },
    [collapsedGroupKeySet]
  );

  const toggleGroupCollapsed = useCallback((groupKey: string) => {
    const normalized = groupKey.trim();
    if (!normalized) {
      return;
    }
    setCollapsedGroupKeys((previous) => {
      if (previous.includes(normalized)) {
        return previous.filter((keyValue) => keyValue !== normalized);
      }
      return [...previous, normalized];
    });
  }, []);

  const expandAllGroups = useCallback(() => {
    setCollapsedGroupKeys([]);
  }, []);

  const collapseAllGroups = useCallback(() => {
    setCollapsedGroupKeys(stableGroupKeys);
  }, [stableGroupKeys]);

  return {
    collapsedGroupKeys,
    collapsedGroupKeySet,
    isGroupCollapsed,
    toggleGroupCollapsed,
    expandAllGroups,
    collapseAllGroups,
  };
}

export const vmGroupPrefsTestUtils = {
  makeVmGroupPrefsStorageKey,
  normalizeVmGroupPrefsSnapshot,
};

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "react-native";

import { normalizeBaseUrl } from "../api/client";
import { STORAGE_ANALYTICS_ANON_ID, STORAGE_ANALYTICS_ENABLED, makeId } from "../constants";
import { ServerProfile } from "../types";

type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

type UseAnalyticsArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

function sanitizeProps(props: AnalyticsProps | undefined): Record<string, string | number | boolean> {
  if (!props) {
    return {};
  }
  const next: Record<string, string | number | boolean> = {};
  Object.entries(props).forEach(([key, value]) => {
    if (value === null || value === undefined) {
      return;
    }
    const cleanKey = key.trim().slice(0, 40);
    if (!cleanKey) {
      return;
    }
    if (typeof value === "string") {
      next[cleanKey] = value.trim().slice(0, 120);
      return;
    }
    if (typeof value === "number") {
      if (Number.isFinite(value)) {
        next[cleanKey] = value;
      }
      return;
    }
    next[cleanKey] = value;
  });
  return next;
}

export function useAnalytics({ activeServer, connected }: UseAnalyticsArgs) {
  const [enabled, setEnabledState] = useState<boolean>(true);
  const [anonId, setAnonId] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [savedEnabled, savedAnonId] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_ANALYTICS_ENABLED),
        SecureStore.getItemAsync(STORAGE_ANALYTICS_ANON_ID),
      ]);

      if (!mounted) {
        return;
      }

      const resolvedEnabled = savedEnabled !== "false";
      const resolvedAnonId = savedAnonId?.trim() || `anon-${makeId()}`;

      setEnabledState(resolvedEnabled);
      setAnonId(resolvedAnonId);

      if (!savedAnonId) {
        await SecureStore.setItemAsync(STORAGE_ANALYTICS_ANON_ID, resolvedAnonId);
      }
      if (!savedEnabled) {
        await SecureStore.setItemAsync(STORAGE_ANALYTICS_ENABLED, "true");
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const setEnabled = useCallback(async (value: boolean) => {
    setEnabledState(value);
    await SecureStore.setItemAsync(STORAGE_ANALYTICS_ENABLED, value ? "true" : "false");
  }, []);

  const track = useCallback(
    (event: string, props?: AnalyticsProps) => {
      const cleanEvent = event.trim().slice(0, 64);
      if (!enabled || !cleanEvent || !anonId) {
        return;
      }

      const payload = {
        event: cleanEvent,
        at: new Date().toISOString(),
        anon_id: anonId,
        platform: Platform.OS,
        props: sanitizeProps(props),
      };

      if (!activeServer || !connected) {
        return;
      }

      const endpoint = `${normalizeBaseUrl(activeServer.baseUrl)}/analytics/event`;
      void fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      }).catch(() => {
        // Analytics is best-effort only.
      });
    },
    [activeServer, anonId, connected, enabled]
  );

  return {
    analyticsEnabled: enabled,
    analyticsAnonId: anonId,
    setAnalyticsEnabled: setEnabled,
    track,
  };
}

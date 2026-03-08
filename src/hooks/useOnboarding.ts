import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_ONBOARDING_DONE, STORAGE_SERVERS } from "../constants";

export function useOnboarding() {
  const [loading, setLoading] = useState<boolean>(true);
  const [completed, setCompleted] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const [rawFlag, rawServers] = await Promise.all([
          SecureStore.getItemAsync(STORAGE_ONBOARDING_DONE),
          SecureStore.getItemAsync(STORAGE_SERVERS),
        ]);
        if (!mounted) {
          return;
        }
        let nextCompleted = rawFlag === "1";
        if (!nextCompleted && rawServers) {
          try {
            const parsed = JSON.parse(rawServers) as Array<unknown>;
            if (Array.isArray(parsed) && parsed.length > 0) {
              nextCompleted = true;
            }
          } catch {
            // Ignore malformed server cache and keep flag-derived state.
          }
        }
        setCompleted(nextCompleted);
      } catch {
        // Do not block app startup if secure storage is unavailable.
        if (mounted) {
          setCompleted(false);
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    try {
      await SecureStore.setItemAsync(STORAGE_ONBOARDING_DONE, "1");
    } catch {
      // Keep onboarding closed for this app session even if persistence fails.
    }
    setCompleted(true);
  }, []);

  return {
    loading,
    completed,
    completeOnboarding,
  };
}

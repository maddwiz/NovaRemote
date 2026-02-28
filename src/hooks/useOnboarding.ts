import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_ONBOARDING_DONE } from "../constants";

export function useOnboarding() {
  const [loading, setLoading] = useState<boolean>(true);
  const [completed, setCompleted] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const raw = await SecureStore.getItemAsync(STORAGE_ONBOARDING_DONE);
      if (!mounted) {
        return;
      }
      setCompleted(raw === "1");
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const completeOnboarding = useCallback(async () => {
    await SecureStore.setItemAsync(STORAGE_ONBOARDING_DONE, "1");
    setCompleted(true);
  }, []);

  return {
    loading,
    completed,
    completeOnboarding,
  };
}

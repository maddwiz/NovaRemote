import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_TUTORIAL_DONE } from "../constants";

export function useTutorial(enabled: boolean) {
  const [loading, setLoading] = useState<boolean>(true);
  const [done, setDone] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function load() {
      if (!enabled) {
        if (mounted) {
          setLoading(false);
        }
        return;
      }

      const raw = await SecureStore.getItemAsync(STORAGE_TUTORIAL_DONE);
      if (!mounted) {
        return;
      }
      setDone(raw === "1");
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [enabled]);

  const finish = useCallback(async () => {
    await SecureStore.setItemAsync(STORAGE_TUTORIAL_DONE, "1");
    setDone(true);
  }, []);

  return {
    loading,
    done,
    finish,
  };
}

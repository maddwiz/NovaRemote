import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_REQUIRE_DANGER_CONFIRM } from "../constants";

export function useSafetyPolicy() {
  const [loading, setLoading] = useState<boolean>(true);
  const [requireDangerConfirm, setRequireDangerConfirmState] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const raw = await SecureStore.getItemAsync(STORAGE_REQUIRE_DANGER_CONFIRM);
      if (!mounted) {
        return;
      }
      setRequireDangerConfirmState(raw !== "0");
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const setRequireDangerConfirm = useCallback(async (value: boolean) => {
    setRequireDangerConfirmState(value);
    if (value) {
      await SecureStore.setItemAsync(STORAGE_REQUIRE_DANGER_CONFIRM, "1");
    } else {
      await SecureStore.setItemAsync(STORAGE_REQUIRE_DANGER_CONFIRM, "0");
    }
  }, []);

  return {
    loading,
    requireDangerConfirm,
    setRequireDangerConfirm,
  };
}

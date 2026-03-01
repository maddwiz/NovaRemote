import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_REQUIRE_DANGER_CONFIRM } from "../constants";
import { decodeRequireDangerConfirm, encodeRequireDangerConfirm } from "./safetyPolicyCodec";

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
      setRequireDangerConfirmState(decodeRequireDangerConfirm(raw));
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const setRequireDangerConfirm = useCallback(async (value: boolean) => {
    setRequireDangerConfirmState(value);
    await SecureStore.setItemAsync(STORAGE_REQUIRE_DANGER_CONFIRM, encodeRequireDangerConfirm(value));
  }, []);

  return {
    loading,
    requireDangerConfirm,
    setRequireDangerConfirm,
  };
}

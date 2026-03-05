import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_REQUIRE_DANGER_CONFIRM } from "../constants";
import { decodeRequireDangerConfirm, encodeRequireDangerConfirm } from "./safetyPolicyCodec";

type UseSafetyPolicyArgs = {
  enforcedDangerConfirm?: boolean | null;
};

export function resolveDangerConfirmSetting(localValue: boolean, enforcedValue?: boolean | null): boolean {
  return typeof enforcedValue === "boolean" ? enforcedValue : localValue;
}

export function useSafetyPolicy({ enforcedDangerConfirm = null }: UseSafetyPolicyArgs = {}) {
  const [loading, setLoading] = useState<boolean>(true);
  const [requireDangerConfirm, setRequireDangerConfirmState] = useState<boolean>(true);
  const managedByTeam = typeof enforcedDangerConfirm === "boolean";

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

  const setRequireDangerConfirm = useCallback(
    async (value: boolean) => {
      if (managedByTeam) {
        if (value !== enforcedDangerConfirm) {
          throw new Error("Dangerous command confirmation is managed by your team admin.");
        }
        return;
      }
      setRequireDangerConfirmState(value);
      await SecureStore.setItemAsync(STORAGE_REQUIRE_DANGER_CONFIRM, encodeRequireDangerConfirm(value));
    },
    [enforcedDangerConfirm, managedByTeam]
  );

  return {
    loading,
    requireDangerConfirm: resolveDangerConfirmSetting(requireDangerConfirm, enforcedDangerConfirm),
    managedByTeam,
    setRequireDangerConfirm,
  };
}

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { DEFAULT_SHELL_WAIT_MS, STORAGE_SHELL_WAIT_MS, STORAGE_SHELL_WAIT_MS_PREFIX } from "../constants";

export function useShellRunWait(activeServerId: string | null) {
  const [shellRunWaitMs, setShellRunWaitMs] = useState<string>(String(DEFAULT_SHELL_WAIT_MS));

  const parsedShellRunWaitMs = useMemo(
    () => Math.max(400, Math.min(Number.parseInt(shellRunWaitMs, 10) || DEFAULT_SHELL_WAIT_MS, 120000)),
    [shellRunWaitMs]
  );

  const setShellRunWaitMsInput = useCallback((value: string) => {
    setShellRunWaitMs(value.replace(/[^0-9]/g, ""));
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadShellRunWait() {
      if (!activeServerId) {
        setShellRunWaitMs(String(DEFAULT_SHELL_WAIT_MS));
        return;
      }

      setShellRunWaitMs(String(DEFAULT_SHELL_WAIT_MS));
      const scopedKey = `${STORAGE_SHELL_WAIT_MS_PREFIX}.${activeServerId}`;
      let raw = await SecureStore.getItemAsync(scopedKey);
      if (!raw) {
        raw = await SecureStore.getItemAsync(STORAGE_SHELL_WAIT_MS);
        if (raw) {
          await SecureStore.setItemAsync(scopedKey, raw);
        }
      }

      if (!mounted || !raw) {
        return;
      }
      const parsed = Number.parseInt(raw, 10);
      if (!Number.isFinite(parsed)) {
        return;
      }
      const clamped = Math.max(400, Math.min(parsed, 120000));
      setShellRunWaitMs(String(clamped));
    }

    void loadShellRunWait();
    return () => {
      mounted = false;
    };
  }, [activeServerId]);

  useEffect(() => {
    if (!activeServerId) {
      return;
    }
    void SecureStore.setItemAsync(`${STORAGE_SHELL_WAIT_MS_PREFIX}.${activeServerId}`, String(parsedShellRunWaitMs));
  }, [activeServerId, parsedShellRunWaitMs]);

  return {
    shellRunWaitMs,
    parsedShellRunWaitMs,
    setShellRunWaitMsInput,
  };
}

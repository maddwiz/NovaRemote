import * as LocalAuthentication from "expo-local-authentication";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_REQUIRE_BIOMETRIC } from "../constants";

export function useBiometricLock() {
  const [loading, setLoading] = useState<boolean>(true);
  const [requireBiometric, setRequireBiometricState] = useState<boolean>(false);
  const [unlocked, setUnlocked] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_REQUIRE_BIOMETRIC);
        const enabled = raw === "1";
        if (!mounted) {
          return;
        }
        setRequireBiometricState(enabled);
        setUnlocked(!enabled);
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

  const setRequireBiometric = useCallback(async (value: boolean) => {
    if (value) {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const isEnrolled = await LocalAuthentication.isEnrolledAsync();
      if (!hasHardware || !isEnrolled) {
        throw new Error("Biometric authentication is unavailable on this device.");
      }

      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: "Enable biometric protection",
        fallbackLabel: "Use Passcode",
        cancelLabel: "Cancel",
        disableDeviceFallback: false,
      });

      if (!result.success) {
        throw new Error("Biometric setup was cancelled.");
      }

      setRequireBiometricState(true);
      await SecureStore.setItemAsync(STORAGE_REQUIRE_BIOMETRIC, "1");
      setUnlocked(true);
    } else {
      setRequireBiometricState(false);
      await SecureStore.deleteItemAsync(STORAGE_REQUIRE_BIOMETRIC);
      setUnlocked(true);
    }
  }, []);

  const unlock = useCallback(async () => {
    if (!requireBiometric) {
      setUnlocked(true);
      return true;
    }

    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();

    if (!hasHardware || !isEnrolled) {
      throw new Error("Biometric authentication is unavailable on this device.");
    }

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: "Unlock NovaRemote",
      fallbackLabel: "Use Passcode",
      cancelLabel: "Cancel",
      disableDeviceFallback: false,
    });

    if (!result.success) {
      throw new Error("Biometric unlock was cancelled.");
    }

    setUnlocked(true);
    return true;
  }, [requireBiometric]);

  const lock = useCallback(() => {
    if (requireBiometric) {
      setUnlocked(false);
    }
  }, [requireBiometric]);

  return {
    loading,
    requireBiometric,
    unlocked,
    setRequireBiometric,
    unlock,
    lock,
  };
}

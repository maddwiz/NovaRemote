import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_GLASSES_MODE } from "../constants";
import { GlassesBrand, GlassesModeSettings } from "../types";

const DEFAULT_GLASSES_MODE: GlassesModeSettings = {
  enabled: false,
  brand: "xreal_x1",
  textScale: 1,
  voiceAutoSend: true,
  voiceLoop: false,
  wakePhraseEnabled: false,
  wakePhrase: "nova",
  minimalMode: true,
};

function normalizeBrand(value: unknown): GlassesBrand {
  if (value === "xreal_x1" || value === "halo" || value === "custom") {
    return value;
  }
  return DEFAULT_GLASSES_MODE.brand;
}

function normalizeTextScale(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value || ""));
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GLASSES_MODE.textScale;
  }
  return Math.max(0.85, Math.min(parsed, 1.6));
}

function normalizeWakePhrase(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_GLASSES_MODE.wakePhrase;
  }
  return normalized.slice(0, 32);
}

export function useGlassesMode() {
  const [settings, setSettings] = useState<GlassesModeSettings>(DEFAULT_GLASSES_MODE);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const raw = await SecureStore.getItemAsync(STORAGE_GLASSES_MODE);
      if (!mounted || !raw) {
        return;
      }
      try {
        const parsed = JSON.parse(raw) as Partial<GlassesModeSettings>;
        setSettings({
          enabled: Boolean(parsed.enabled),
          brand: normalizeBrand(parsed.brand),
          textScale: normalizeTextScale(parsed.textScale),
          voiceAutoSend: parsed.voiceAutoSend !== undefined ? Boolean(parsed.voiceAutoSend) : DEFAULT_GLASSES_MODE.voiceAutoSend,
          voiceLoop: parsed.voiceLoop !== undefined ? Boolean(parsed.voiceLoop) : DEFAULT_GLASSES_MODE.voiceLoop,
          wakePhraseEnabled:
            parsed.wakePhraseEnabled !== undefined ? Boolean(parsed.wakePhraseEnabled) : DEFAULT_GLASSES_MODE.wakePhraseEnabled,
          wakePhrase: normalizeWakePhrase(parsed.wakePhrase),
          minimalMode: parsed.minimalMode !== undefined ? Boolean(parsed.minimalMode) : DEFAULT_GLASSES_MODE.minimalMode,
        });
      } catch {
        setSettings(DEFAULT_GLASSES_MODE);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    void SecureStore.setItemAsync(STORAGE_GLASSES_MODE, JSON.stringify(settings));
  }, [settings]);

  const setEnabled = useCallback((enabled: boolean) => {
    setSettings((prev) => ({ ...prev, enabled }));
  }, []);

  const setBrand = useCallback((brand: GlassesBrand) => {
    setSettings((prev) => ({ ...prev, brand: normalizeBrand(brand) }));
  }, []);

  const setVoiceAutoSend = useCallback((voiceAutoSend: boolean) => {
    setSettings((prev) => ({ ...prev, voiceAutoSend }));
  }, []);

  const setVoiceLoop = useCallback((voiceLoop: boolean) => {
    setSettings((prev) => ({ ...prev, voiceLoop }));
  }, []);

  const setWakePhraseEnabled = useCallback((wakePhraseEnabled: boolean) => {
    setSettings((prev) => ({ ...prev, wakePhraseEnabled }));
  }, []);

  const setWakePhrase = useCallback((wakePhrase: string) => {
    setSettings((prev) => ({ ...prev, wakePhrase: normalizeWakePhrase(wakePhrase) }));
  }, []);

  const setMinimalMode = useCallback((minimalMode: boolean) => {
    setSettings((prev) => ({ ...prev, minimalMode }));
  }, []);

  const setTextScale = useCallback((textScale: number) => {
    setSettings((prev) => ({ ...prev, textScale: normalizeTextScale(textScale) }));
  }, []);

  return {
    settings,
    setEnabled,
    setBrand,
    setVoiceAutoSend,
    setVoiceLoop,
    setWakePhraseEnabled,
    setWakePhrase,
    setMinimalMode,
    setTextScale,
  };
}

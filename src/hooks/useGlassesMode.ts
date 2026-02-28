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
  vadEnabled: false,
  vadSilenceMs: 900,
  loopCaptureMs: 6500,
  headsetPttEnabled: true,
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

function normalizeVadSilenceMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GLASSES_MODE.vadSilenceMs;
  }
  return Math.max(250, Math.min(parsed, 5000));
}

function normalizeLoopCaptureMs(value: unknown): number {
  const parsed = typeof value === "number" ? value : Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) {
    return DEFAULT_GLASSES_MODE.loopCaptureMs;
  }
  return Math.max(1500, Math.min(parsed, 30000));
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
          vadEnabled: parsed.vadEnabled !== undefined ? Boolean(parsed.vadEnabled) : DEFAULT_GLASSES_MODE.vadEnabled,
          vadSilenceMs: normalizeVadSilenceMs(parsed.vadSilenceMs),
          loopCaptureMs: normalizeLoopCaptureMs(parsed.loopCaptureMs),
          headsetPttEnabled:
            parsed.headsetPttEnabled !== undefined ? Boolean(parsed.headsetPttEnabled) : DEFAULT_GLASSES_MODE.headsetPttEnabled,
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

  const setVadEnabled = useCallback((vadEnabled: boolean) => {
    setSettings((prev) => ({ ...prev, vadEnabled }));
  }, []);

  const setVadSilenceMs = useCallback((vadSilenceMs: number) => {
    setSettings((prev) => ({ ...prev, vadSilenceMs: normalizeVadSilenceMs(vadSilenceMs) }));
  }, []);

  const setLoopCaptureMs = useCallback((loopCaptureMs: number) => {
    setSettings((prev) => ({ ...prev, loopCaptureMs: normalizeLoopCaptureMs(loopCaptureMs) }));
  }, []);

  const setHeadsetPttEnabled = useCallback((headsetPttEnabled: boolean) => {
    setSettings((prev) => ({ ...prev, headsetPttEnabled }));
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
    setVadEnabled,
    setVadSilenceMs,
    setLoopCaptureMs,
    setHeadsetPttEnabled,
    setTextScale,
  };
}

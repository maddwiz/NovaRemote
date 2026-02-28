import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_TERMINAL_THEME } from "../constants";
import { TerminalFontFamily, TerminalThemePresetId, TerminalThemeSettings } from "../types";
import { DEFAULT_TERMINAL_THEME, normalizeTerminalTheme } from "../theme/terminalTheme";

export function useTerminalTheme() {
  const [terminalTheme, setTerminalTheme] = useState<TerminalThemeSettings>(DEFAULT_TERMINAL_THEME);

  useEffect(() => {
    let mounted = true;
    async function loadTheme() {
      try {
        const raw = await SecureStore.getItemAsync(STORAGE_TERMINAL_THEME);
        if (!mounted || !raw) {
          return;
        }
        const parsed = JSON.parse(raw) as Partial<TerminalThemeSettings>;
        setTerminalTheme(normalizeTerminalTheme(parsed));
      } catch {
        setTerminalTheme(DEFAULT_TERMINAL_THEME);
      }
    }
    void loadTheme();
    return () => {
      mounted = false;
    };
  }, []);

  const updateTheme = useCallback((updater: (prev: TerminalThemeSettings) => Partial<TerminalThemeSettings>) => {
    setTerminalTheme((prev) => {
      const next = normalizeTerminalTheme({ ...prev, ...updater(prev) });
      void SecureStore.setItemAsync(STORAGE_TERMINAL_THEME, JSON.stringify(next));
      return next;
    });
  }, []);

  const setPreset = useCallback(
    (preset: TerminalThemePresetId) => {
      updateTheme(() => ({ preset }));
    },
    [updateTheme]
  );

  const setFontFamily = useCallback(
    (fontFamily: TerminalFontFamily) => {
      updateTheme(() => ({ fontFamily }));
    },
    [updateTheme]
  );

  const setFontSize = useCallback(
    (fontSize: number) => {
      updateTheme(() => ({ fontSize }));
    },
    [updateTheme]
  );

  const setBackgroundOpacity = useCallback(
    (backgroundOpacity: number) => {
      updateTheme(() => ({ backgroundOpacity }));
    },
    [updateTheme]
  );

  return {
    terminalTheme,
    setPreset,
    setFontFamily,
    setFontSize,
    setBackgroundOpacity,
  };
}

import { Platform, TextStyle, ViewStyle } from "react-native";

import { TerminalFontFamily, TerminalThemePresetId, TerminalThemeSettings } from "../types";

export type TerminalThemePreset = {
  id: TerminalThemePresetId;
  label: string;
  text: string;
  background: string;
  border: string;
};

export const TERMINAL_THEME_PRESETS: TerminalThemePreset[] = [
  { id: "nova", label: "Nova", text: "#efe8ff", background: "#02010a", border: "#2fd4ff" },
  { id: "solarized_dark", label: "Solarized", text: "#93a1a1", background: "#002b36", border: "#268bd2" },
  { id: "monokai", label: "Monokai", text: "#f8f8f2", background: "#272822", border: "#a6e22e" },
  { id: "dracula", label: "Dracula", text: "#f8f8f2", background: "#282a36", border: "#bd93f9" },
  { id: "nord", label: "Nord", text: "#d8dee9", background: "#2e3440", border: "#88c0d0" },
  { id: "one_dark", label: "One Dark", text: "#abb2bf", background: "#282c34", border: "#61afef" },
];

export const TERMINAL_FONT_OPTIONS: Array<{ id: TerminalFontFamily; label: string }> = [
  { id: "menlo", label: "Menlo" },
  { id: "sf_mono", label: "SF Mono" },
  { id: "jetbrains_mono", label: "JetBrains Mono" },
];

export const TERMINAL_BG_OPACITY_OPTIONS: number[] = [0.72, 0.85, 1];

export const TERMINAL_MIN_FONT_SIZE = 11;
export const TERMINAL_MAX_FONT_SIZE = 18;

export const DEFAULT_TERMINAL_THEME: TerminalThemeSettings = {
  preset: "nova",
  fontSize: 13,
  fontFamily: "menlo",
  backgroundOpacity: 1,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function hexToRgba(hex: string, alpha: number): string {
  const normalized = hex.replace("#", "");
  const compact = normalized.length === 3 ? normalized.split("").map((entry) => `${entry}${entry}`).join("") : normalized;
  if (!/^[0-9a-f]{6}$/i.test(compact)) {
    return hex;
  }
  const int = Number.parseInt(compact, 16);
  const red = (int >> 16) & 255;
  const green = (int >> 8) & 255;
  const blue = int & 255;
  return `rgba(${red}, ${green}, ${blue}, ${clamp(alpha, 0, 1)})`;
}

function resolveFontFamily(fontFamily: TerminalFontFamily): string {
  switch (fontFamily) {
    case "sf_mono":
      return Platform.select({ ios: "SF Mono", android: "monospace", default: "monospace" }) || "monospace";
    case "jetbrains_mono":
      return Platform.select({ ios: "JetBrainsMono-Regular", android: "monospace", default: "monospace" }) || "monospace";
    case "menlo":
    default:
      return Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) || "monospace";
  }
}

export function normalizeTerminalTheme(input: Partial<TerminalThemeSettings> | null | undefined): TerminalThemeSettings {
  const preset = input?.preset && TERMINAL_THEME_PRESETS.some((entry) => entry.id === input.preset) ? input.preset : DEFAULT_TERMINAL_THEME.preset;
  const fontFamily =
    input?.fontFamily && TERMINAL_FONT_OPTIONS.some((entry) => entry.id === input.fontFamily) ? input.fontFamily : DEFAULT_TERMINAL_THEME.fontFamily;
  const fontSize = Number.isFinite(input?.fontSize)
    ? clamp(Math.round(input?.fontSize || DEFAULT_TERMINAL_THEME.fontSize), TERMINAL_MIN_FONT_SIZE, TERMINAL_MAX_FONT_SIZE)
    : DEFAULT_TERMINAL_THEME.fontSize;
  const backgroundOpacity = Number.isFinite(input?.backgroundOpacity)
    ? clamp(input?.backgroundOpacity || DEFAULT_TERMINAL_THEME.backgroundOpacity, 0.5, 1)
    : DEFAULT_TERMINAL_THEME.backgroundOpacity;

  return {
    preset,
    fontSize,
    fontFamily,
    backgroundOpacity,
  };
}

export function getTerminalPreset(preset: TerminalThemePresetId): TerminalThemePreset {
  return TERMINAL_THEME_PRESETS.find((entry) => entry.id === preset) || TERMINAL_THEME_PRESETS[0];
}

export function buildTerminalAppearance(theme: TerminalThemeSettings): {
  terminalViewStyle: ViewStyle;
  modalTerminalViewStyle: ViewStyle;
  terminalTextStyle: TextStyle;
} {
  const normalized = normalizeTerminalTheme(theme);
  const preset = getTerminalPreset(normalized.preset);
  const bgColor = hexToRgba(preset.background, normalized.backgroundOpacity);

  return {
    terminalViewStyle: {
      borderColor: preset.border,
      backgroundColor: bgColor,
    },
    modalTerminalViewStyle: {
      borderColor: preset.border,
      backgroundColor: bgColor,
    },
    terminalTextStyle: {
      color: preset.text,
      fontSize: normalized.fontSize,
      lineHeight: Math.round(normalized.fontSize * 1.38),
      fontFamily: resolveFontFamily(normalized.fontFamily),
    },
  };
}

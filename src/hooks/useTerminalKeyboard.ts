import { useCallback, useMemo, useState } from "react";

export type KeyboardLayer = 0 | 1 | 2;

export type KeyboardBarState = {
  activeLayer: KeyboardLayer;
  ctrlActive: boolean;
  ctrlLocked: boolean;
  altActive: boolean;
  altLocked: boolean;
};

export type KeyPayload = {
  text?: string;
  controlChar?: string;
  action?: string;
};

function cycleModifier(active: boolean, locked: boolean): { active: boolean; locked: boolean } {
  if (!active) {
    return { active: true, locked: false };
  }
  if (!locked) {
    return { active: true, locked: true };
  }
  return { active: false, locked: false };
}

function ctrlControlChar(key: string): string | null {
  if (!/^[a-z]$/i.test(key)) {
    return null;
  }
  const normalized = key.toLowerCase();
  const code = normalized.charCodeAt(0) - 96;
  if (code < 1 || code > 26) {
    return null;
  }
  return String.fromCharCode(code);
}

function normalizeCombo(key: string): { forceCtrl: boolean; forceAlt: boolean; key: string } {
  const normalized = key.trim().toLowerCase();
  if (normalized.startsWith("ctrl+")) {
    return { forceCtrl: true, forceAlt: false, key: normalized.slice(5) };
  }
  if (normalized.startsWith("alt+")) {
    return { forceCtrl: false, forceAlt: true, key: normalized.slice(4) };
  }
  return { forceCtrl: false, forceAlt: false, key: normalized };
}

export function useTerminalKeyboard() {
  const [state, setState] = useState<KeyboardBarState>({
    activeLayer: 0,
    ctrlActive: false,
    ctrlLocked: false,
    altActive: false,
    altLocked: false,
  });

  const setActiveLayer = useCallback((layer: KeyboardLayer) => {
    setState((prev) => (prev.activeLayer === layer ? prev : { ...prev, activeLayer: layer }));
  }, []);

  const toggleCtrl = useCallback(() => {
    setState((prev) => {
      const next = cycleModifier(prev.ctrlActive, prev.ctrlLocked);
      return { ...prev, ctrlActive: next.active, ctrlLocked: next.locked };
    });
  }, []);

  const toggleAlt = useCallback(() => {
    setState((prev) => {
      const next = cycleModifier(prev.altActive, prev.altLocked);
      return { ...prev, altActive: next.active, altLocked: next.locked };
    });
  }, []);

  const resetModifiers = useCallback(() => {
    setState((prev) => {
      if (!prev.ctrlActive && !prev.ctrlLocked && !prev.altActive && !prev.altLocked) {
        return prev;
      }
      return {
        ...prev,
        ctrlActive: false,
        ctrlLocked: false,
        altActive: false,
        altLocked: false,
      };
    });
  }, []);

  const buildKeyPayload = useCallback((keyInput: string): KeyPayload => {
    const parsed = normalizeCombo(keyInput);
    const key = parsed.key;
    const ctrlOn = parsed.forceCtrl || state.ctrlActive;
    const altOn = parsed.forceAlt || state.altActive;

    let payload: KeyPayload;
    if (key === "up") {
      payload = { action: "history_prev" };
    } else if (key === "down") {
      payload = { action: "history_next" };
    } else if (key === "left") {
      payload = { action: "cursor_left" };
    } else if (key === "right") {
      payload = { action: "cursor_right" };
    } else if (key === "tab") {
      payload = { text: "\t" };
    } else if (key === "esc") {
      payload = { controlChar: "\u001b" };
    } else if (key.startsWith("f") && /^f([1-9]|1[0-2])$/.test(key)) {
      const map: Record<string, string> = {
        f1: "\u001bOP",
        f2: "\u001bOQ",
        f3: "\u001bOR",
        f4: "\u001bOS",
        f5: "\u001b[15~",
        f6: "\u001b[17~",
        f7: "\u001b[18~",
        f8: "\u001b[19~",
        f9: "\u001b[20~",
        f10: "\u001b[21~",
        f11: "\u001b[23~",
        f12: "\u001b[24~",
      };
      payload = { controlChar: map[key] };
    } else if (ctrlOn && key === "a") {
      payload = { action: "cursor_home" };
    } else if (ctrlOn && key === "e") {
      payload = { action: "cursor_end" };
    } else if (ctrlOn && key === "w") {
      payload = { action: "delete_word_back" };
    } else if (altOn && key === "b") {
      payload = { action: "word_back" };
    } else if (altOn && key === "f") {
      payload = { action: "word_forward" };
    } else if (ctrlOn) {
      const controlChar = ctrlControlChar(key);
      payload = controlChar ? { controlChar } : { text: key };
    } else if (altOn) {
      payload = { controlChar: `\u001b${key}` };
    } else {
      payload = { text: key };
    }

    const usedCtrl = ctrlOn || parsed.forceCtrl;
    const usedAlt = altOn || parsed.forceAlt;
    if (usedCtrl || usedAlt) {
      setState((prev) => ({
        ...prev,
        ctrlActive: prev.ctrlLocked ? prev.ctrlActive : false,
        altActive: prev.altLocked ? prev.altActive : false,
      }));
    }

    return payload;
  }, [state.altActive, state.ctrlActive]);

  return useMemo(
    () => ({
      state,
      setActiveLayer,
      toggleCtrl,
      toggleAlt,
      resetModifiers,
      buildKeyPayload,
    }),
    [buildKeyPayload, resetModifiers, setActiveLayer, state, toggleAlt, toggleCtrl]
  );
}

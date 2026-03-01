import { describe, expect, it } from "vitest";

import { resolveKeyboardPayload } from "./useTerminalKeyboard";

const baseState = {
  ctrlActive: false,
  ctrlLocked: false,
  altActive: false,
  altLocked: false,
};

describe("useTerminalKeyboard payload resolver", () => {
  it("returns control characters and auto-resets unlocked modifiers", () => {
    const first = resolveKeyboardPayload(
      {
        ctrlActive: true,
        ctrlLocked: false,
        altActive: false,
        altLocked: false,
      },
      "c"
    );

    expect(first.payload).toEqual({ controlChar: "\u0003" });
    expect(first.nextModifierState.ctrlActive).toBe(false);

    const second = resolveKeyboardPayload(
      {
        ctrlActive: true,
        ctrlLocked: true,
        altActive: false,
        altLocked: false,
      },
      "z"
    );

    expect(second.payload).toEqual({ controlChar: "\u001a" });
    expect(second.nextModifierState.ctrlActive).toBe(true);
    expect(second.nextModifierState.ctrlLocked).toBe(true);
  });

  it("maps function keys to ANSI escape sequences", () => {
    const f1 = resolveKeyboardPayload(baseState, "f1");
    const f12 = resolveKeyboardPayload(baseState, "f12");

    expect(f1.payload).toEqual({ controlChar: "\u001bOP" });
    expect(f12.payload).toEqual({ controlChar: "\u001b[24~" });
  });

  it("supports combo keys for built-in actions", () => {
    const home = resolveKeyboardPayload(baseState, "ctrl+a");
    const deleteWord = resolveKeyboardPayload(baseState, "ctrl+w");
    const wordBack = resolveKeyboardPayload(baseState, "alt+b");

    expect(home.payload).toEqual({ action: "cursor_home" });
    expect(deleteWord.payload).toEqual({ action: "delete_word_back" });
    expect(wordBack.payload).toEqual({ action: "word_back" });
  });

  it("falls back to alt-prefixed escape sequences", () => {
    const result = resolveKeyboardPayload(
      {
        ctrlActive: false,
        ctrlLocked: false,
        altActive: true,
        altLocked: false,
      },
      "f"
    );

    expect(result.payload).toEqual({ action: "word_forward" });
    expect(result.nextModifierState.altActive).toBe(false);

    const altLiteral = resolveKeyboardPayload(
      {
        ctrlActive: false,
        ctrlLocked: false,
        altActive: true,
        altLocked: false,
      },
      "x"
    );
    expect(altLiteral.payload).toEqual({ controlChar: "\u001bx" });
  });
});

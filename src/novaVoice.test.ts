import { describe, expect, it } from "vitest";

import { DEFAULT_NOVA_WAKE_PHRASE, normalizeNovaWakePhrase, resolveNovaWakeCommand } from "./novaVoice";

describe("normalizeNovaWakePhrase", () => {
  it("falls back to the default phrase", () => {
    expect(normalizeNovaWakePhrase("")).toBe(DEFAULT_NOVA_WAKE_PHRASE);
  });

  it("normalizes spacing and casing", () => {
    expect(normalizeNovaWakePhrase("  HeY   NoVa  ")).toBe("hey nova");
  });
});

describe("resolveNovaWakeCommand", () => {
  it("extracts the command after the wake phrase", () => {
    expect(resolveNovaWakeCommand("hey nova open terminals", "hey nova")).toEqual({
      heardWakePhrase: true,
      command: "open terminals",
    });
  });

  it("marks wake only when the phrase is spoken alone", () => {
    expect(resolveNovaWakeCommand("hey nova", "hey nova")).toEqual({
      heardWakePhrase: true,
      command: "",
    });
  });

  it("returns no wake when the phrase is absent", () => {
    expect(resolveNovaWakeCommand("open terminals", "hey nova")).toEqual({
      heardWakePhrase: false,
      command: "",
    });
  });
});

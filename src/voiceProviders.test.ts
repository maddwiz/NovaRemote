import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

let voiceProvidersModule: Awaited<typeof import("./voiceProviders")> | null = null;

vi.mock("expo-file-system", () => ({
  File: class MockFile {
    uri = "file:///tmp/mock.mp3";
    exists = false;
    create() {}
    write() {}
    delete() {}
  },
  Paths: {
    cache: "file:///tmp",
  },
}));

beforeEach(async () => {
  vi.stubGlobal("__DEV__", false);
  voiceProvidersModule = await import("./voiceProviders");
});

afterEach(() => {
  vi.unstubAllGlobals();
  voiceProvidersModule = null;
});

describe("voiceProviders", () => {
  it("normalizes linked voice provider ids", () => {
    if (!voiceProvidersModule) {
      throw new Error("voiceProviders module not loaded");
    }
    expect(voiceProvidersModule.normalizeNovaLinkedVoiceProvider("elevenlabs")).toBe("elevenlabs");
    expect(voiceProvidersModule.normalizeNovaLinkedVoiceProvider("system")).toBe("system");
    expect(voiceProvidersModule.normalizeNovaLinkedVoiceProvider("other")).toBe("system");
  });

  it("trims API keys safely", () => {
    if (!voiceProvidersModule) {
      throw new Error("voiceProviders module not loaded");
    }
    expect(voiceProvidersModule.trimVoiceProviderApiKey("  key-123  ")).toBe("key-123");
    expect(voiceProvidersModule.trimVoiceProviderApiKey(null)).toBe("");
  });

  it("prefers a saved external voice when it still exists", () => {
    if (!voiceProvidersModule) {
      throw new Error("voiceProviders module not loaded");
    }
    const voices = [
      { identifier: "voice-a", name: "Ava", label: "Ava" },
      { identifier: "voice-b", name: "Rachel", label: "Rachel" },
    ];
    expect(voiceProvidersModule.selectPreferredExternalVoice(voices, "voice-b")).toBe("voice-b");
    expect(voiceProvidersModule.selectPreferredExternalVoice(voices, "missing")).toBe("voice-a");
    expect(voiceProvidersModule.selectPreferredExternalVoice([], "missing")).toBe("");
  });
});

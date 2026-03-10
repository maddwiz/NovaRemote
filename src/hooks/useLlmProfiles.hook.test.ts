import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STORAGE_ACTIVE_LLM_PROFILE_ID, STORAGE_LLM_PROFILES } from "../constants";
import { useLlmProfiles } from "./useLlmProfiles";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  return {
    storage,
    getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      storage.delete(key);
    }),
  };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
  deleteItemAsync: secureStoreMock.deleteItemAsync,
}));

type UseLlmProfilesHandle = ReturnType<typeof useLlmProfiles>;

function latestOrThrow(value: UseLlmProfilesHandle | null): UseLlmProfilesHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
  secureStoreMock.deleteItemAsync.mockClear();
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("useLlmProfiles hook", () => {
  it("seeds a dev ollama profile from environment when storage is empty", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_URL", "http://10.0.0.71:11434");
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_MODEL", "llama3.2:3b");
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_NAME", "Macbook Ollama");

    let latest: UseLlmProfilesHandle | null = null;
    function Harness() {
      latest = useLlmProfiles();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loading, "seeded llm load");

    expect(latestOrThrow(latest).profiles).toHaveLength(1);
    expect(latestOrThrow(latest).profiles[0]).toMatchObject({
      id: "dev-local-ollama",
      name: "Macbook Ollama",
      kind: "ollama",
      baseUrl: "http://10.0.0.71:11434",
      model: "llama3.2:3b",
    });
    expect(latestOrThrow(latest).activeProfileId).toBe("dev-local-ollama");
    expect(secureStoreMock.storage.get(STORAGE_ACTIVE_LLM_PROFILE_ID)).toBe("dev-local-ollama");
    expect(secureStoreMock.storage.has(STORAGE_LLM_PROFILES)).toBe(true);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("upserts a dev ollama profile even when stored profiles already exist", async () => {
    vi.stubGlobal("__DEV__", true);
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_URL", "http://10.0.0.71:11434");
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_MODEL", "llama3.2:3b");
    vi.stubEnv("EXPO_PUBLIC_DEV_OLLAMA_NAME", "Macbook Ollama");
    secureStoreMock.storage.set(
      STORAGE_LLM_PROFILES,
      JSON.stringify([
        {
          id: "existing-profile",
          name: "Existing",
          kind: "openai_compatible",
          baseUrl: "https://api.openai.com/v1",
          apiKey: "key",
          model: "gpt-test",
        },
      ])
    );
    secureStoreMock.storage.set(STORAGE_ACTIVE_LLM_PROFILE_ID, "existing-profile");

    let latest: UseLlmProfilesHandle | null = null;
    function Harness() {
      latest = useLlmProfiles();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => !latestOrThrow(latest).loading, "merged seeded llm load");

    expect(latestOrThrow(latest).profiles).toHaveLength(2);
    expect(latestOrThrow(latest).profiles.map((profile) => profile.id)).toContain("dev-local-ollama");
    expect(latestOrThrow(latest).activeProfileId).toBe("existing-profile");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

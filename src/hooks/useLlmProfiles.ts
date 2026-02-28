import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_ACTIVE_LLM_PROFILE_ID, STORAGE_LLM_PROFILES, makeId } from "../constants";
import { LlmProfile } from "../types";

const LLM_EXPORT_PREFIX = "novaremote.llm.enc.v1.";

function encodeUtf8(value: string): Uint8Array {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value);
  }
  const escaped = unescape(encodeURIComponent(value));
  const bytes = new Uint8Array(escaped.length);
  for (let i = 0; i < escaped.length; i += 1) {
    bytes[i] = escaped.charCodeAt(i);
  }
  return bytes;
}

function decodeUtf8(bytes: Uint8Array): string {
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder().decode(bytes);
  }
  let escaped = "";
  for (let i = 0; i < bytes.length; i += 1) {
    escaped += String.fromCharCode(bytes[i]);
  }
  return decodeURIComponent(escape(escaped));
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof btoa !== "function") {
    throw new Error("Base64 encoding is unavailable on this device.");
  }
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof atob !== "function") {
    throw new Error("Base64 decoding is unavailable on this device.");
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function xorBytes(input: Uint8Array, key: Uint8Array): Uint8Array {
  if (key.length === 0) {
    throw new Error("Passphrase is required.");
  }
  const result = new Uint8Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    result[i] = input[i] ^ key[i % key.length];
  }
  return result;
}

export function useLlmProfiles() {
  const [profiles, setProfiles] = useState<LlmProfile[]>([]);
  const [activeProfileId, setActiveProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [rawProfiles, rawActive] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_LLM_PROFILES),
        SecureStore.getItemAsync(STORAGE_ACTIVE_LLM_PROFILE_ID),
      ]);

      if (!mounted) {
        return;
      }

      let parsedProfiles: LlmProfile[] = [];
      if (rawProfiles) {
        try {
          const parsed = JSON.parse(rawProfiles) as LlmProfile[];
          parsedProfiles = Array.isArray(parsed) ? parsed : [];
        } catch {
          parsedProfiles = [];
        }
      }

      const active = parsedProfiles.find((profile) => profile.id === rawActive)?.id || parsedProfiles[0]?.id || null;
      setProfiles(parsedProfiles);
      setActiveProfileId(active);
      setLoading(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (nextProfiles: LlmProfile[], nextActive: string | null) => {
    await Promise.all([
      SecureStore.setItemAsync(STORAGE_LLM_PROFILES, JSON.stringify(nextProfiles)),
      nextActive
        ? SecureStore.setItemAsync(STORAGE_ACTIVE_LLM_PROFILE_ID, nextActive)
        : SecureStore.deleteItemAsync(STORAGE_ACTIVE_LLM_PROFILE_ID),
    ]);
  }, []);

  const saveProfile = useCallback(
    async (input: Omit<LlmProfile, "id"> & { id?: string }) => {
      const profile: LlmProfile = {
        id: input.id || makeId(),
        name: input.name.trim() || "LLM Provider",
        kind: input.kind,
        baseUrl: input.baseUrl.trim(),
        apiKey: input.apiKey.trim(),
        model: input.model.trim(),
        systemPrompt: input.systemPrompt?.trim() || undefined,
      };

      const nextProfiles = input.id
        ? profiles.map((entry) => (entry.id === input.id ? profile : entry))
        : [profile, ...profiles];

      const nextActive = activeProfileId || profile.id;
      setProfiles(nextProfiles);
      setActiveProfileId(nextActive);
      await persist(nextProfiles, nextActive);
      return profile;
    },
    [activeProfileId, persist, profiles]
  );

  const deleteProfile = useCallback(
    async (id: string) => {
      const nextProfiles = profiles.filter((profile) => profile.id !== id);
      const nextActive = activeProfileId === id ? nextProfiles[0]?.id || null : activeProfileId;
      setProfiles(nextProfiles);
      setActiveProfileId(nextActive);
      await persist(nextProfiles, nextActive);
    },
    [activeProfileId, persist, profiles]
  );

  const setActive = useCallback(
    async (id: string) => {
      setActiveProfileId(id);
      await persist(profiles, id);
    },
    [persist, profiles]
  );

  const activeProfile = useMemo(
    () => profiles.find((profile) => profile.id === activeProfileId) || null,
    [activeProfileId, profiles]
  );

  const exportEncrypted = useCallback(
    (passphrase: string) => {
      const key = encodeUtf8(passphrase.trim());
      if (key.length === 0) {
        throw new Error("Passphrase is required.");
      }

      const payload = JSON.stringify({
        version: 1,
        exported_at: new Date().toISOString(),
        activeProfileId,
        profiles,
      });

      const encrypted = xorBytes(encodeUtf8(payload), key);
      return `${LLM_EXPORT_PREFIX}${bytesToBase64(encrypted)}`;
    },
    [activeProfileId, profiles]
  );

  const importEncrypted = useCallback(
    async (blob: string, passphrase: string) => {
      const key = encodeUtf8(passphrase.trim());
      if (key.length === 0) {
        throw new Error("Passphrase is required.");
      }

      const raw = blob.trim();
      if (!raw.startsWith(LLM_EXPORT_PREFIX)) {
        throw new Error("Invalid encrypted LLM payload.");
      }

      const encrypted = base64ToBytes(raw.slice(LLM_EXPORT_PREFIX.length));
      const decrypted = xorBytes(encrypted, key);
      let parsed: { profiles?: LlmProfile[]; activeProfileId?: string } | null = null;
      try {
        parsed = JSON.parse(decodeUtf8(decrypted)) as { profiles?: LlmProfile[]; activeProfileId?: string };
      } catch {
        throw new Error("Failed to decrypt payload. Check passphrase.");
      }

      const incoming = Array.isArray(parsed?.profiles) ? parsed?.profiles || [] : [];
      if (incoming.length === 0) {
        throw new Error("No profiles found in payload.");
      }

      const mergedMap = new Map<string, LlmProfile>();
      profiles.forEach((profile) => mergedMap.set(profile.id, profile));
      incoming.forEach((profile) => {
        const id = profile.id || makeId();
        mergedMap.set(id, {
          ...profile,
          id,
          name: profile.name?.trim() || "LLM Provider",
          baseUrl: profile.baseUrl?.trim() || "",
          model: profile.model?.trim() || "",
          apiKey: profile.apiKey?.trim() || "",
          kind:
            profile.kind === "anthropic"
              ? "anthropic"
              : profile.kind === "ollama"
                ? "ollama"
                : profile.kind === "gemini"
                  ? "gemini"
                  : "openai_compatible",
        });
      });

      const nextProfiles = Array.from(mergedMap.values());
      const importedActive = parsed?.activeProfileId && mergedMap.has(parsed.activeProfileId) ? parsed.activeProfileId : null;
      const nextActive = activeProfileId || importedActive || nextProfiles[0]?.id || null;

      setProfiles(nextProfiles);
      setActiveProfileId(nextActive);
      await persist(nextProfiles, nextActive);

      return {
        total: nextProfiles.length,
        imported: incoming.length,
      };
    },
    [activeProfileId, persist, profiles]
  );

  return {
    loading,
    profiles,
    activeProfile,
    activeProfileId,
    saveProfile,
    deleteProfile,
    setActive,
    exportEncrypted,
    importEncrypted,
  };
}

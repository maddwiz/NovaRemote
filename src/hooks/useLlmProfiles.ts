import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_ACTIVE_LLM_PROFILE_ID, STORAGE_LLM_PROFILES, makeId } from "../constants";
import { LlmProfile } from "../types";

const LLM_EXPORT_PREFIX = "novaremote.llm.aes.v1.";
const LLM_EXPORT_PREFIX_LEGACY = "novaremote.llm.enc.v1.";
const LLM_EXPORT_PBKDF2_ITERATIONS = 120000;

let cryptoJsCache: any | null = null;

function getCryptoJs() {
  if (!cryptoJsCache) {
    // Lazy require keeps crypto-js out of the hot startup path.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    cryptoJsCache = require("crypto-js");
  }
  return cryptoJsCache;
}

type LlmEncryptedEnvelope = {
  version: 1;
  cipher: "aes-256-cbc";
  kdf: "pbkdf2-sha256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

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

function requirePassphrase(passphrase: string): string {
  const trimmed = passphrase.trim();
  if (!trimmed) {
    throw new Error("Passphrase is required.");
  }
  return trimmed;
}

function deriveAesKey(passphrase: string, salt: any, iterations: number): any {
  const CryptoJS = getCryptoJs();
  return CryptoJS.PBKDF2(passphrase, salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
}

function encryptPayload(payload: string, passphrase: string): string {
  const CryptoJS = getCryptoJs();
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = deriveAesKey(passphrase, salt, LLM_EXPORT_PBKDF2_ITERATIONS);
  const encrypted = CryptoJS.AES.encrypt(payload, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });

  const envelope: LlmEncryptedEnvelope = {
    version: 1,
    cipher: "aes-256-cbc",
    kdf: "pbkdf2-sha256",
    iterations: LLM_EXPORT_PBKDF2_ITERATIONS,
    salt: CryptoJS.enc.Base64.stringify(salt),
    iv: CryptoJS.enc.Base64.stringify(iv),
    ciphertext: CryptoJS.enc.Base64.stringify(encrypted.ciphertext),
  };

  return `${LLM_EXPORT_PREFIX}${bytesToBase64(encodeUtf8(JSON.stringify(envelope)))}`;
}

function decryptPayload(rawBlob: string, passphrase: string): string {
  const raw = rawBlob.trim();

  if (raw.startsWith(LLM_EXPORT_PREFIX)) {
    const CryptoJS = getCryptoJs();
    let envelope: LlmEncryptedEnvelope;
    try {
      envelope = JSON.parse(decodeUtf8(base64ToBytes(raw.slice(LLM_EXPORT_PREFIX.length)))) as LlmEncryptedEnvelope;
    } catch {
      throw new Error("Invalid encrypted payload format.");
    }

    if (
      !envelope ||
      envelope.version !== 1 ||
      envelope.cipher !== "aes-256-cbc" ||
      envelope.kdf !== "pbkdf2-sha256" ||
      !Number.isFinite(envelope.iterations) ||
      envelope.iterations < 1000 ||
      !envelope.salt ||
      !envelope.iv ||
      !envelope.ciphertext
    ) {
      throw new Error("Unsupported encrypted payload format.");
    }

    try {
      const salt = CryptoJS.enc.Base64.parse(envelope.salt);
      const iv = CryptoJS.enc.Base64.parse(envelope.iv);
      const ciphertext = CryptoJS.enc.Base64.parse(envelope.ciphertext);
      const key = deriveAesKey(passphrase, salt, envelope.iterations);
      const decrypted = CryptoJS.AES.decrypt(CryptoJS.lib.CipherParams.create({ ciphertext }), key, {
        iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      });
      const plaintext = decrypted.toString(CryptoJS.enc.Utf8);
      if (!plaintext) {
        throw new Error("Decrypt failed");
      }
      return plaintext;
    } catch {
      throw new Error("Failed to decrypt payload. Check passphrase.");
    }
  }

  if (raw.startsWith(LLM_EXPORT_PREFIX_LEGACY)) {
    try {
      const key = encodeUtf8(passphrase);
      const encrypted = base64ToBytes(raw.slice(LLM_EXPORT_PREFIX_LEGACY.length));
      const decrypted = xorBytes(encrypted, key);
      return decodeUtf8(decrypted);
    } catch {
      throw new Error(
        "This export uses an older format. Re-export from the source device, or verify the passphrase used for that legacy export."
      );
    }
  }

  throw new Error(
    "Invalid encrypted LLM payload. Supported formats: novaremote.llm.aes.v1 and legacy novaremote.llm.enc.v1."
  );
}

function normalizeImportedProfile(profile: LlmProfile): LlmProfile {
  return {
    ...profile,
    id: profile.id || makeId(),
    name: profile.name?.trim() || "LLM Provider",
    baseUrl: profile.baseUrl?.trim() || "",
    model: profile.model?.trim() || "",
    apiKey: profile.apiKey?.trim() || "",
    requestPath: profile.requestPath?.trim() || undefined,
    extraHeaders: profile.extraHeaders?.trim() || undefined,
    azureDeployment: profile.azureDeployment?.trim() || undefined,
    azureApiVersion: profile.azureApiVersion?.trim() || undefined,
    kind:
      profile.kind === "azure_openai"
        ? "azure_openai"
        : profile.kind === "anthropic"
        ? "anthropic"
        : profile.kind === "ollama"
        ? "ollama"
        : profile.kind === "gemini"
        ? "gemini"
        : "openai_compatible",
  };
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
        requestPath: input.requestPath?.trim() || undefined,
        extraHeaders: input.extraHeaders?.trim() || undefined,
        azureDeployment: input.azureDeployment?.trim() || undefined,
        azureApiVersion: input.azureApiVersion?.trim() || undefined,
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
      const securedPassphrase = requirePassphrase(passphrase);
      const payload = JSON.stringify({
        version: 1,
        exported_at: new Date().toISOString(),
        activeProfileId,
        profiles,
      });
      return encryptPayload(payload, securedPassphrase);
    },
    [activeProfileId, profiles]
  );

  const importEncrypted = useCallback(
    async (blob: string, passphrase: string) => {
      const securedPassphrase = requirePassphrase(passphrase);
      let parsed: { profiles?: LlmProfile[]; activeProfileId?: string } | null = null;

      try {
        parsed = JSON.parse(decryptPayload(blob, securedPassphrase)) as { profiles?: LlmProfile[]; activeProfileId?: string };
      } catch (error) {
        if (error instanceof Error) {
          throw error;
        }
        throw new Error("Failed to decrypt payload. Check passphrase.");
      }

      const incoming = Array.isArray(parsed?.profiles) ? parsed?.profiles || [] : [];
      if (incoming.length === 0) {
        throw new Error("No profiles found in payload.");
      }

      const mergedMap = new Map<string, LlmProfile>();
      profiles.forEach((profile) => mergedMap.set(profile.id, profile));
      incoming.forEach((profile) => {
        const normalized = normalizeImportedProfile(profile);
        mergedMap.set(normalized.id, normalized);
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

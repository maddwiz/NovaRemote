import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_ACTIVE_LLM_PROFILE_ID, STORAGE_LLM_PROFILES, makeId } from "../constants";
import { LlmProfile } from "../types";

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

  return {
    loading,
    profiles,
    activeProfile,
    activeProfileId,
    saveProfile,
    deleteProfile,
    setActive,
  };
}

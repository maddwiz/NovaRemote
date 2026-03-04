import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { makeId, STORAGE_VOICE_CHANNELS } from "../constants";
import { VoiceChannel } from "../types";

type CreateVoiceChannelInput = {
  workspaceId: string;
  name: string;
};

export type UseVoiceChannelsResult = {
  channels: VoiceChannel[];
  loading: boolean;
  createChannel: (input: CreateVoiceChannelInput) => VoiceChannel | null;
  deleteChannel: (channelId: string) => void;
  pruneWorkspaceChannels: (workspaceIds: string[]) => void;
  joinChannel: (channelId: string) => void;
  leaveChannel: (channelId: string) => void;
  toggleMute: (channelId: string) => void;
};

function normalizeChannelName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeVoiceChannel(value: unknown): VoiceChannel | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<VoiceChannel>;
  const workspaceId = typeof parsed.workspaceId === "string" ? parsed.workspaceId.trim() : "";
  const name = typeof parsed.name === "string" ? normalizeChannelName(parsed.name) : "";

  if (!workspaceId || !name) {
    return null;
  }

  const id = typeof parsed.id === "string" && parsed.id ? parsed.id : `voice-${makeId()}`;
  const createdAt = typeof parsed.createdAt === "string" && parsed.createdAt ? parsed.createdAt : new Date().toISOString();
  const updatedAt = typeof parsed.updatedAt === "string" && parsed.updatedAt ? parsed.updatedAt : createdAt;

  return {
    id,
    workspaceId,
    name,
    joined: Boolean(parsed.joined),
    muted: Boolean(parsed.muted),
    createdAt,
    updatedAt,
  };
}

function sortChannels(channels: VoiceChannel[]): VoiceChannel[] {
  return channels
    .slice()
    .sort((a, b) => {
      if (a.workspaceId !== b.workspaceId) {
        return a.workspaceId.localeCompare(b.workspaceId);
      }
      if (a.joined !== b.joined) {
        return a.joined ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
}

function joinWorkspaceChannel(channels: VoiceChannel[], channelId: string): VoiceChannel[] {
  const target = channels.find((channel) => channel.id === channelId);
  if (!target) {
    return channels;
  }

  const now = new Date().toISOString();
  return sortChannels(
    channels.map((channel) => {
      if (channel.workspaceId !== target.workspaceId) {
        return channel;
      }
      if (channel.id === channelId) {
        return { ...channel, joined: true, updatedAt: now };
      }
      if (!channel.joined) {
        return channel;
      }
      return { ...channel, joined: false, updatedAt: now };
    })
  );
}

export function useVoiceChannels(): UseVoiceChannelsResult {
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  useEffect(() => {
    let cancelled = false;

    void SecureStore.getItemAsync(STORAGE_VOICE_CHANNELS)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        if (!raw) {
          setChannels([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          const normalized = Array.isArray(parsed)
            ? sortChannels(parsed.map((entry) => normalizeVoiceChannel(entry)).filter((entry): entry is VoiceChannel => Boolean(entry)))
            : [];
          setChannels(normalized);
        } catch {
          setChannels([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    void SecureStore.setItemAsync(STORAGE_VOICE_CHANNELS, JSON.stringify(channels)).catch(() => {});
  }, [channels, loading]);

  const createChannel = useCallback((input: CreateVoiceChannelInput): VoiceChannel | null => {
    const workspaceId = input.workspaceId.trim();
    const name = normalizeChannelName(input.name);
    if (!workspaceId || !name) {
      return null;
    }

    const now = new Date().toISOString();
    const channel: VoiceChannel = {
      id: `voice-${makeId()}`,
      workspaceId,
      name,
      joined: false,
      muted: false,
      createdAt: now,
      updatedAt: now,
    };

    setChannels((previous) => sortChannels([channel, ...previous]));
    return channel;
  }, []);

  const deleteChannel = useCallback((channelId: string) => {
    setChannels((previous) => previous.filter((channel) => channel.id !== channelId));
  }, []);

  const pruneWorkspaceChannels = useCallback((workspaceIds: string[]) => {
    const allowedWorkspaceIds = new Set(workspaceIds.map((value) => value.trim()).filter(Boolean));
    setChannels((previous) => {
      if (allowedWorkspaceIds.size === 0) {
        return previous.length === 0 ? previous : [];
      }
      const next = previous.filter((channel) => allowedWorkspaceIds.has(channel.workspaceId));
      if (next.length === previous.length) {
        return previous;
      }
      return sortChannels(next);
    });
  }, []);

  const joinChannel = useCallback((channelId: string) => {
    setChannels((previous) => joinWorkspaceChannel(previous, channelId));
  }, []);

  const leaveChannel = useCallback((channelId: string) => {
    const now = new Date().toISOString();
    setChannels((previous) =>
      sortChannels(
        previous.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                joined: false,
                updatedAt: now,
              }
            : channel
        )
      )
    );
  }, []);

  const toggleMute = useCallback((channelId: string) => {
    const now = new Date().toISOString();
    setChannels((previous) =>
      sortChannels(
        previous.map((channel) =>
          channel.id === channelId
            ? {
                ...channel,
                muted: !channel.muted,
                updatedAt: now,
              }
            : channel
        )
      )
    );
  }, []);

  return useMemo(
    () => ({
      channels,
      loading,
      createChannel,
      deleteChannel,
      pruneWorkspaceChannels,
      joinChannel,
      leaveChannel,
      toggleMute,
    }),
    [channels, createChannel, deleteChannel, pruneWorkspaceChannels, joinChannel, leaveChannel, loading, toggleMute]
  );
}

export const voiceChannelsTestUtils = {
  normalizeVoiceChannel,
  normalizeChannelName,
  joinWorkspaceChannel,
};

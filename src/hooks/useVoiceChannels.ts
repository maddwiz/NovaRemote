import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
  setChannelParticipantActive: (channelId: string, participantId: string, active: boolean) => void;
  setActiveSpeaker: (channelId: string, participantId: string | null) => void;
  syncChannelParticipants: (
    channelId: string,
    participantIds: string[],
    options?: { preserveLocalParticipant?: boolean }
  ) => void;
};

const LOCAL_VOICE_PARTICIPANT_ID = "local-user";

function normalizeChannelName(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeParticipantId(value: string): string {
  return value.trim().toLowerCase();
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
  const activeParticipantIds = Array.isArray(parsed.activeParticipantIds)
    ? Array.from(
        new Set(
          parsed.activeParticipantIds
            .map((entry) => (typeof entry === "string" ? normalizeParticipantId(entry) : ""))
            .filter(Boolean)
        )
      )
    : [];
  const activeSpeakerIdRaw = typeof parsed.activeSpeakerId === "string" ? normalizeParticipantId(parsed.activeSpeakerId) : "";
  const activeSpeakerId = activeSpeakerIdRaw || null;
  const lastSpokeAt = typeof parsed.lastSpokeAt === "string" ? parsed.lastSpokeAt : null;

  return {
    id,
    workspaceId,
    name,
    joined: Boolean(parsed.joined),
    muted: Boolean(parsed.muted),
    activeParticipantIds,
    activeSpeakerId,
    lastSpokeAt,
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

function joinWorkspaceChannel(
  channels: VoiceChannel[],
  channelId: string,
  participantId: string = LOCAL_VOICE_PARTICIPANT_ID
): VoiceChannel[] {
  const target = channels.find((channel) => channel.id === channelId);
  if (!target) {
    return channels;
  }

  const now = new Date().toISOString();
  const normalizedParticipantId = normalizeParticipantId(participantId);
  return sortChannels(
    channels.map((channel) => {
      if (channel.workspaceId !== target.workspaceId) {
        return channel;
      }
      if (channel.id === channelId) {
        const activeParticipantIds = Array.from(
          new Set([...(channel.activeParticipantIds || []), normalizedParticipantId].filter(Boolean))
        );
        return {
          ...channel,
          joined: true,
          activeParticipantIds,
          updatedAt: now,
        };
      }
      if (!channel.joined) {
        return channel;
      }
      return {
        ...channel,
        joined: false,
        activeSpeakerId: channel.activeSpeakerId === normalizedParticipantId ? null : channel.activeSpeakerId || null,
        activeParticipantIds: (channel.activeParticipantIds || []).filter((id) => id !== normalizedParticipantId),
        updatedAt: now,
      };
    })
  );
}

export function useVoiceChannels(): UseVoiceChannelsResult {
  const [channels, setChannels] = useState<VoiceChannel[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const channelsRef = useRef<VoiceChannel[]>([]);

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
          channelsRef.current = normalized;
          setChannels(normalized);
        } catch {
          channelsRef.current = [];
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
    channelsRef.current = channels;
  }, [channels]);

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

    const existing = channelsRef.current.find(
      (channel) =>
        channel.workspaceId === workspaceId &&
        channel.name.trim().toLowerCase() === name.toLowerCase()
    );
    if (existing) {
      return existing;
    }

    const now = new Date().toISOString();
    const channel: VoiceChannel = {
      id: `voice-${makeId()}`,
      workspaceId,
      name,
      joined: false,
      muted: false,
      activeParticipantIds: [],
      activeSpeakerId: null,
      lastSpokeAt: null,
      createdAt: now,
      updatedAt: now,
    };
    channelsRef.current = sortChannels([channel, ...channelsRef.current]);
    setChannels((previous) => {
      const duplicate = previous.find(
        (channel) =>
          channel.workspaceId === workspaceId &&
          channel.name.trim().toLowerCase() === name.toLowerCase()
      );
      if (duplicate) {
        channelsRef.current = previous;
        return previous;
      }
      const next = sortChannels([channel, ...previous]);
      channelsRef.current = next;
      return next;
    });
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
                activeSpeakerId:
                  channel.activeSpeakerId === LOCAL_VOICE_PARTICIPANT_ID ? null : channel.activeSpeakerId || null,
                activeParticipantIds: (channel.activeParticipantIds || []).filter(
                  (participantId) => participantId !== LOCAL_VOICE_PARTICIPANT_ID
                ),
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

  const setChannelParticipantActive = useCallback((channelId: string, participantId: string, active: boolean) => {
    const normalizedParticipantId = normalizeParticipantId(participantId);
    if (!normalizedParticipantId) {
      return;
    }
    const now = new Date().toISOString();
    setChannels((previous) =>
      sortChannels(
        previous.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const activeParticipantIds = new Set(channel.activeParticipantIds || []);
          if (active) {
            activeParticipantIds.add(normalizedParticipantId);
          } else {
            activeParticipantIds.delete(normalizedParticipantId);
          }
          const nextActiveSpeakerId =
            !active && channel.activeSpeakerId === normalizedParticipantId
              ? null
              : channel.activeSpeakerId || null;
          return {
            ...channel,
            activeParticipantIds: Array.from(activeParticipantIds),
            activeSpeakerId: nextActiveSpeakerId,
            updatedAt: now,
          };
        })
      )
    );
  }, []);

  const setActiveSpeaker = useCallback((channelId: string, participantId: string | null) => {
    const normalizedParticipantId = participantId ? normalizeParticipantId(participantId) : "";
    const now = new Date().toISOString();
    setChannels((previous) =>
      sortChannels(
        previous.map((channel) => {
          if (channel.id !== channelId) {
            return channel;
          }
          const activeParticipantIds = new Set(channel.activeParticipantIds || []);
          if (normalizedParticipantId) {
            activeParticipantIds.add(normalizedParticipantId);
          }
          return {
            ...channel,
            activeParticipantIds: Array.from(activeParticipantIds),
            activeSpeakerId: normalizedParticipantId || null,
            lastSpokeAt: normalizedParticipantId ? now : channel.lastSpokeAt || null,
            updatedAt: now,
          };
        })
      )
    );
  }, []);

  const syncChannelParticipants = useCallback(
    (
      channelId: string,
      participantIds: string[],
      options: { preserveLocalParticipant?: boolean } = {}
    ) => {
      const normalizedParticipants = Array.from(
        new Set(participantIds.map((value) => normalizeParticipantId(value)).filter(Boolean))
      ).sort();
      const preserveLocalParticipant = options.preserveLocalParticipant !== false;
      setChannels((previous) =>
        sortChannels(
          previous.map((channel) => {
            if (channel.id !== channelId) {
              return channel;
            }

            const nextParticipantsSet = new Set(normalizedParticipants);
            if (preserveLocalParticipant && (channel.activeParticipantIds || []).includes(LOCAL_VOICE_PARTICIPANT_ID)) {
              nextParticipantsSet.add(LOCAL_VOICE_PARTICIPANT_ID);
            }
            const nextParticipants = Array.from(nextParticipantsSet).sort();
            const currentParticipants = Array.from(new Set(channel.activeParticipantIds || [])).sort();
            const participantsChanged =
              nextParticipants.length !== currentParticipants.length ||
              nextParticipants.some((value, index) => value !== currentParticipants[index]);

            const activeSpeakerStillPresent =
              !channel.activeSpeakerId || nextParticipantsSet.has(normalizeParticipantId(channel.activeSpeakerId));
            const nextActiveSpeakerId = activeSpeakerStillPresent ? channel.activeSpeakerId || null : null;
            const activeSpeakerChanged = nextActiveSpeakerId !== (channel.activeSpeakerId || null);

            if (!participantsChanged && !activeSpeakerChanged) {
              return channel;
            }

            return {
              ...channel,
              activeParticipantIds: nextParticipants,
              activeSpeakerId: nextActiveSpeakerId,
              updatedAt: new Date().toISOString(),
            };
          })
        )
      );
    },
    []
  );

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
      setChannelParticipantActive,
      setActiveSpeaker,
      syncChannelParticipants,
    }),
    [
      channels,
      createChannel,
      deleteChannel,
      pruneWorkspaceChannels,
      joinChannel,
      leaveChannel,
      loading,
      toggleMute,
      setChannelParticipantActive,
      setActiveSpeaker,
      syncChannelParticipants,
    ]
  );
}

export const voiceChannelsTestUtils = {
  normalizeVoiceChannel,
  normalizeChannelName,
  normalizeParticipantId,
  joinWorkspaceChannel,
};

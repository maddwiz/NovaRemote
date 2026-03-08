import { SessionCollaborator } from "./types";

const DEFAULT_REMOTE_SPEAKER_ACTIVE_WINDOW_MS = 30_000;

type DerivedVoicePresence = {
  remoteParticipantIds: string[];
  activeRemoteSpeakerId: string | null;
};

function normalizeParticipantId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeLastSeenAt(value: number | null): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return value;
}

export function deriveVoicePresence(
  sessionPresence: Record<string, SessionCollaborator[]>,
  options: {
    nowMs?: number;
    activeWindowMs?: number;
  } = {}
): DerivedVoicePresence {
  const nowMs = options.nowMs ?? Date.now();
  const activeWindowMs = Math.max(1_000, Math.floor(options.activeWindowMs ?? DEFAULT_REMOTE_SPEAKER_ACTIVE_WINDOW_MS));
  const participants = new Map<string, number | null>();

  Object.values(sessionPresence)
    .flat()
    .forEach((collaborator) => {
      if (collaborator.isSelf) {
        return;
      }
      const id = normalizeParticipantId(collaborator.id || "");
      if (!id) {
        return;
      }
      const lastSeenAt = normalizeLastSeenAt(collaborator.lastSeenAt);
      const existing = participants.get(id);
      if (existing === undefined) {
        participants.set(id, lastSeenAt);
        return;
      }
      if (lastSeenAt === null) {
        return;
      }
      if (existing === null || lastSeenAt > existing) {
        participants.set(id, lastSeenAt);
      }
    });

  const remoteParticipantIds = Array.from(participants.keys()).sort();
  let activeRemoteSpeakerId: string | null = null;
  let activeRemoteSpeakerSeenAt = -Infinity;
  participants.forEach((lastSeenAt, participantId) => {
    if (lastSeenAt === null) {
      return;
    }
    if (nowMs - lastSeenAt > activeWindowMs) {
      return;
    }
    if (lastSeenAt > activeRemoteSpeakerSeenAt) {
      activeRemoteSpeakerSeenAt = lastSeenAt;
      activeRemoteSpeakerId = participantId;
    }
  });

  return {
    remoteParticipantIds,
    activeRemoteSpeakerId,
  };
}


import { SessionCollaborator, WorkspaceMember } from "./types";

const DEFAULT_REMOTE_SPEAKER_ACTIVE_WINDOW_MS = 30_000;

type DerivedVoicePresence = {
  remoteParticipantIds: string[];
  activeRemoteSpeakerId: string | null;
};

export type VoiceParticipantDirectoryEntry = {
  id: string;
  name: string;
  role: string | null;
  lastSeenAt: number | null;
  isSelf: boolean;
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

export function buildVoiceParticipantDirectory(
  sessionPresence: Record<string, SessionCollaborator[]>,
  workspaceMembers: WorkspaceMember[] = []
): Record<string, VoiceParticipantDirectoryEntry> {
  const entries = new Map<string, VoiceParticipantDirectoryEntry>();

  workspaceMembers.forEach((member) => {
    const id = normalizeParticipantId(member.id || "");
    const name = (member.name || "").trim();
    if (!id) {
      return;
    }
    entries.set(id, {
      id,
      name: name || id,
      role: member.role || null,
      lastSeenAt: null,
      isSelf: id === "local-user",
    });
  });

  Object.values(sessionPresence)
    .flat()
    .forEach((collaborator) => {
      const id = normalizeParticipantId(collaborator.id || "");
      if (!id) {
        return;
      }
      const name = (collaborator.name || "").trim();
      const existing = entries.get(id);
      const lastSeenAt = normalizeLastSeenAt(collaborator.lastSeenAt);
      const shouldReplace =
        !existing ||
        (lastSeenAt !== null && (existing.lastSeenAt === null || lastSeenAt >= existing.lastSeenAt));
      if (!shouldReplace) {
        if (!existing?.role && collaborator.role) {
          entries.set(id, {
            ...existing,
            role: collaborator.role,
          });
        }
        return;
      }

      entries.set(id, {
        id,
        name: name || existing?.name || id,
        role: collaborator.role || existing?.role || null,
        lastSeenAt,
        isSelf: collaborator.isSelf || id === "local-user",
      });
    });

  return Object.fromEntries(Array.from(entries.entries()));
}

export function resolveVoiceParticipantLabel(
  participantId: string,
  directory: Record<string, VoiceParticipantDirectoryEntry>,
  options: { includeRole?: boolean } = {}
): string {
  const normalizedId = normalizeParticipantId(participantId || "");
  if (!normalizedId) {
    return "";
  }
  const entry = directory[normalizedId];
  if (!entry) {
    return normalizedId;
  }
  if (options.includeRole && entry.role) {
    return `${entry.name} (${entry.role})`;
  }
  return entry.name;
}

export function summarizeVoiceParticipants(
  participantIds: string[],
  directory: Record<string, VoiceParticipantDirectoryEntry>,
  options: { maxNames?: number; includeRole?: boolean } = {}
): string {
  const maxNames = Math.max(1, Math.floor(options.maxNames ?? 3));
  const labels = Array.from(
    new Set(
      participantIds
        .map((participantId) => resolveVoiceParticipantLabel(participantId, directory, { includeRole: options.includeRole }))
        .filter(Boolean)
    )
  );
  if (labels.length <= maxNames) {
    return labels.join(", ");
  }
  const visible = labels.slice(0, maxNames);
  return `${visible.join(", ")} +${labels.length - maxNames}`;
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

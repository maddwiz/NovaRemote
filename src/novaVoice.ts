export const DEFAULT_NOVA_WAKE_PHRASE = "hey nova";

export type NovaVoiceSettings = {
  handsFreeEnabled: boolean;
  wakePhrase: string;
};

export type NovaWakeResolution = {
  heardWakePhrase: boolean;
  command: string;
};

export function normalizeNovaWakePhrase(value: unknown): string {
  const normalized = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!normalized) {
    return DEFAULT_NOVA_WAKE_PHRASE;
  }
  return normalized.slice(0, 32);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function stripWakePrefix(value: string): string {
  return value.replace(/^[\s,.:;!?'"-]+/, "").trim();
}

export function resolveNovaWakeCommand(transcript: string, wakePhrase: string): NovaWakeResolution {
  const trimmed = transcript.trim();
  if (!trimmed) {
    return {
      heardWakePhrase: false,
      command: "",
    };
  }

  const normalizedWakePhrase = normalizeNovaWakePhrase(wakePhrase);
  if (!normalizedWakePhrase) {
    return {
      heardWakePhrase: true,
      command: trimmed,
    };
  }

  const matcher = new RegExp(`\\b${escapeRegex(normalizedWakePhrase)}\\b`, "i");
  const match = matcher.exec(trimmed);
  if (!match) {
    return {
      heardWakePhrase: false,
      command: "",
    };
  }

  const start = match.index + match[0].length;
  const after = stripWakePrefix(trimmed.slice(start));
  if (after) {
    return {
      heardWakePhrase: true,
      command: after,
    };
  }

  return {
    heardWakePhrase: true,
    command: trimmed.slice(0, match.index).trim(),
  };
}

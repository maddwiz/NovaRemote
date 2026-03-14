import { File, Paths } from "expo-file-system";

export type NovaLinkedVoiceProvider = "system" | "elevenlabs";

export type NovaExternalVoiceChoice = {
  identifier: string;
  name: string;
  label: string;
};

const ELEVENLABS_BASE_URL = "https://api.elevenlabs.io";
const ELEVENLABS_MODEL_ID = "eleven_multilingual_v2";

export function normalizeNovaLinkedVoiceProvider(value: unknown): NovaLinkedVoiceProvider {
  return value === "elevenlabs" ? "elevenlabs" : "system";
}

export function trimVoiceProviderApiKey(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeExternalVoiceId(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function maskVoiceProviderApiKey(value: string): string {
  const trimmed = trimVoiceProviderApiKey(value);
  if (!trimmed) {
    return "";
  }
  if (trimmed.length <= 8) {
    return "•".repeat(trimmed.length);
  }
  return `${trimmed.slice(0, 4)}••••${trimmed.slice(-4)}`;
}

export function selectPreferredExternalVoice(
  voices: NovaExternalVoiceChoice[],
  preferredId: string
): string {
  const normalizedPreferredId = normalizeExternalVoiceId(preferredId);
  if (normalizedPreferredId && voices.some((voice) => voice.identifier === normalizedPreferredId)) {
    return normalizedPreferredId;
  }
  return voices[0]?.identifier || "";
}

function toLabel(name: string, accent?: string): string {
  return accent ? `${name} · ${accent}` : name;
}

function parseElevenLabsError(payload: unknown, status: number): string {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const detail =
      typeof record.detail === "string"
        ? record.detail
        : typeof record.message === "string"
          ? record.message
          : "";
    if (detail) {
      return `ElevenLabs error (${status}): ${detail.trim()}`;
    }
  }
  return `ElevenLabs error (${status}).`;
}

export async function fetchElevenLabsVoices(apiKey: string): Promise<NovaExternalVoiceChoice[]> {
  const trimmedApiKey = trimVoiceProviderApiKey(apiKey);
  if (!trimmedApiKey) {
    return [];
  }

  const response = await fetch(`${ELEVENLABS_BASE_URL}/v1/voices`, {
    headers: {
      "xi-api-key": trimmedApiKey,
    },
  });

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    throw new Error(parseElevenLabsError(payload, response.status));
  }

  const payload = (await response.json()) as {
    voices?: Array<{
      voice_id?: string;
      name?: string;
      labels?: Record<string, string>;
      category?: string;
    }>;
  };

  return (payload.voices || [])
    .filter((voice) => typeof voice.voice_id === "string" && typeof voice.name === "string")
    .map((voice) => {
      const accent = voice.labels?.accent || voice.labels?.gender || voice.category;
      return {
        identifier: voice.voice_id!.trim(),
        name: voice.name!.trim(),
        label: toLabel(voice.name!.trim(), typeof accent === "string" ? accent.trim() : ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function synthesizeElevenLabsSpeechToFile(args: {
  apiKey: string;
  voiceId: string;
  text: string;
}): Promise<File> {
  const apiKey = trimVoiceProviderApiKey(args.apiKey);
  const voiceId = normalizeExternalVoiceId(args.voiceId);
  const text = String(args.text || "").trim();

  if (!apiKey) {
    throw new Error("Add your ElevenLabs API key first.");
  }
  if (!voiceId) {
    throw new Error("Choose an ElevenLabs voice first.");
  }
  if (!text) {
    throw new Error("Nova had nothing to say.");
  }

  const response = await fetch(
    `${ELEVENLABS_BASE_URL}/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        Accept: "audio/mpeg",
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL_ID,
        voice_settings: {
          stability: 0.42,
          similarity_boost: 0.86,
          style: 0.18,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    throw new Error(parseElevenLabsError(payload, response.status));
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.length) {
    throw new Error("ElevenLabs returned empty audio.");
  }

  const file = new File(Paths.cache, `nova-elevenlabs-${Date.now().toString(36)}.mp3`);
  if (file.exists) {
    file.delete();
  }
  file.create({ overwrite: true, intermediates: true });
  file.write(bytes);
  return file;
}

import { Audio } from "expo-av";
import { useCallback, useEffect, useRef, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { ServerProfile } from "../types";

const BASE_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe", "/speech/transcribe", "/ai/transcribe", "/llm/transcribe"];
const VAD_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe-vad", "/speech/transcribe-vad", "/ai/transcribe-vad", "/llm/transcribe-vad"];

type UseVoiceCaptureArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

type VoiceTranscribeOptions = {
  wakePhrase?: string;
  requireWakePhrase?: boolean;
  vadEnabled?: boolean;
  vadSilenceMs?: number;
};

function readTranscript(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.trim();
  }
  if (!payload || typeof payload !== "object") {
    return "";
  }

  const raw = payload as Record<string, unknown>;
  const candidates = [
    raw.transcript,
    raw.text,
    raw.command,
    raw.output,
    raw.message,
    raw.result,
    raw.data,
    raw.response,
    raw.caption,
    raw?.data && typeof raw.data === "object" ? (raw.data as Record<string, unknown>).transcript : null,
  ];

  for (const value of candidates) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

async function stopAndCleanupRecording(recording: Audio.Recording | null): Promise<void> {
  if (!recording) {
    return;
  }
  try {
    await recording.stopAndUnloadAsync();
  } catch {
    // best effort
  }
}

export function useVoiceCapture({ activeServer, connected }: UseVoiceCaptureArgs) {
  const recordingRef = useRef<Audio.Recording | null>(null);
  const [recording, setRecording] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [lastError, setLastError] = useState<string | null>(null);

  const startCapture = useCallback(async () => {
    if (recording || busy) {
      return;
    }

    const permission = await Audio.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Microphone permission is required for voice capture.");
    }

    setLastError(null);
    setLastTranscript("");

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      staysActiveInBackground: false,
      playThroughEarpieceAndroid: false,
    });

    const recorder = new Audio.Recording();
    await recorder.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recorder.startAsync();

    recordingRef.current = recorder;
    setRecording(true);
  }, [busy, recording]);

  const stopAndTranscribe = useCallback(async (options: VoiceTranscribeOptions = {}): Promise<string> => {
    const recorder = recordingRef.current;
    if (!recorder) {
      throw new Error("Voice capture has not started.");
    }

    setBusy(true);
    setRecording(false);
    setLastError(null);

    try {
      await recorder.stopAndUnloadAsync();
      recordingRef.current = null;
      await Audio.setAudioModeAsync({
        allowsRecordingIOS: false,
        playsInSilentModeIOS: true,
        shouldDuckAndroid: true,
        staysActiveInBackground: false,
        playThroughEarpieceAndroid: false,
      });

      const uri = recorder.getURI();
      if (!uri) {
        throw new Error("Audio capture failed. Please try again.");
      }
      if (!activeServer || !connected) {
        throw new Error("Connect to a server before using voice transcription.");
      }

      const baseUrl = normalizeBaseUrl(activeServer.baseUrl);
      let lastHttpError: string | null = null;

      const endpointOrder = options.vadEnabled
        ? [...VAD_TRANSCRIBE_ENDPOINTS, ...BASE_TRANSCRIBE_ENDPOINTS]
        : BASE_TRANSCRIBE_ENDPOINTS;

      for (const endpoint of endpointOrder) {
        const form = new FormData();
        form.append("file", {
          uri,
          type: "audio/m4a",
          name: "voice-input.m4a",
        } as unknown as Blob);
        const wakePhrase = String(options.wakePhrase || "").trim();
        if (wakePhrase) {
          form.append("wake_phrase", wakePhrase);
        }
        if (typeof options.requireWakePhrase === "boolean") {
          form.append("require_wake_phrase", options.requireWakePhrase ? "true" : "false");
        }
        if (options.vadEnabled) {
          form.append("vad", "true");
          const vadSilenceMs = Number.isFinite(options.vadSilenceMs) ? Math.max(250, Math.min(Number(options.vadSilenceMs), 5000)) : 900;
          form.append("vad_silence_ms", String(vadSilenceMs));
        }

        try {
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${activeServer.token}`,
            },
            body: form,
          });

          if (!response.ok) {
            if (response.status === 404 || response.status === 405 || response.status === 501) {
              continue;
            }
            lastHttpError = `HTTP ${response.status} from ${endpoint}`;
            continue;
          }

          let parsed: unknown = null;
          try {
            parsed = await response.json();
          } catch {
            try {
              parsed = await response.text();
            } catch {
              parsed = null;
            }
          }

          const transcript = readTranscript(parsed);
          if (!transcript) {
            continue;
          }

          setLastTranscript(transcript);
          return transcript;
        } catch (error) {
          lastHttpError = error instanceof Error ? error.message : String(error);
        }
      }

      throw new Error(
        lastHttpError ||
          "No transcription endpoint found. Add one of: /voice/transcribe-vad, /voice/transcribe, /speech/transcribe, /ai/transcribe, /llm/transcribe."
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      throw error;
    } finally {
      setBusy(false);
    }
  }, [activeServer, connected]);

  useEffect(() => {
    return () => {
      const recorder = recordingRef.current;
      recordingRef.current = null;
      void stopAndCleanupRecording(recorder);
    };
  }, []);

  return {
    recording,
    busy,
    lastTranscript,
    lastError,
    startCapture,
    stopAndTranscribe,
    setLastTranscript,
  };
}

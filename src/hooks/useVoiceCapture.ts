import {
  RecordingPresets,
  getRecordingPermissionsAsync,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
  type AudioRecorder,
  type RecordingOptions,
} from "expo-audio";
import { useCallback, useEffect, useState } from "react";

import { normalizeBaseUrl } from "../api/client";
import { ServerProfile } from "../types";

const BASE_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe", "/speech/transcribe", "/ai/transcribe", "/llm/transcribe"];
const VAD_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe-vad", "/speech/transcribe-vad", "/ai/transcribe-vad", "/llm/transcribe-vad"];
const TRANSCRIBE_AUDIO_MIME = "audio/m4a";
const TRANSCRIBE_AUDIO_FORMAT = "m4a-aac";

const VOICE_RECORDING_OPTIONS: RecordingOptions = {
  ...RecordingPresets.HIGH_QUALITY,
  isMeteringEnabled: true,
};

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

type VoicePermissionStatus = "granted" | "denied" | "undetermined" | null;

function devVoiceLog(...args: Array<unknown>) {
  if (__DEV__) {
    console.log("[Voice]", ...args);
  }
}

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

async function stopAndCleanupRecording(recorder: AudioRecorder | null): Promise<void> {
  if (!recorder) {
    return;
  }
  try {
    if (recorder.isRecording) {
      await recorder.stop();
    }
  } catch {
    // best effort
  }
}

export function useVoiceCapture({ activeServer, connected }: UseVoiceCaptureArgs) {
  const recorder = useAudioRecorder(VOICE_RECORDING_OPTIONS);
  const recorderState = useAudioRecorderState(recorder, 120);

  const [recording, setRecording] = useState<boolean>(false);
  const [busy, setBusy] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [meteringDb, setMeteringDb] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<VoicePermissionStatus>(null);

  const resetAudioMode = useCallback(async () => {
    try {
      await setAudioModeAsync({
        allowsRecording: false,
        playsInSilentMode: true,
        interruptionMode: "duckOthers",
        shouldPlayInBackground: false,
        shouldRouteThroughEarpiece: false,
      });
    } catch {
      // best effort
    }
  }, []);

  const requestCapturePermission = useCallback(async () => {
    const next = await requestRecordingPermissionsAsync();
    const status = next.granted ? "granted" : (next.status as VoicePermissionStatus);
    setPermissionStatus(status);
    devVoiceLog("requestCapturePermission", { status, granted: next.granted, canAskAgain: next.canAskAgain });
    return next.granted;
  }, []);

  useEffect(() => {
    let mounted = true;
    async function loadPermission() {
      try {
        const current = await getRecordingPermissionsAsync();
        if (!mounted) {
          return;
        }
        const status = current.granted ? "granted" : (current.status as VoicePermissionStatus);
        setPermissionStatus(status);
        devVoiceLog("loadPermission", { status, granted: current.granted, canAskAgain: current.canAskAgain });
      } catch {
        if (mounted) {
          setPermissionStatus(null);
        }
      }
    }
    void loadPermission();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!recording) {
      return;
    }
    const level = recorderState.metering;
    if (typeof level === "number" && Number.isFinite(level)) {
      setMeteringDb(level);
    }
  }, [recording, recorderState.metering]);

  const startCapture = useCallback(async () => {
    if (recording || busy) {
      return;
    }

    const granted = await requestCapturePermission();
    if (!granted) {
      throw new Error("Microphone permission is required for voice capture.");
    }

    setLastError(null);
    setLastTranscript("");
    setMeteringDb(null);
    devVoiceLog("startCapture:begin", {
      permissionStatus,
      hasServer: Boolean(activeServer),
      connected,
    });

    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      interruptionMode: "duckOthers",
      shouldPlayInBackground: false,
      shouldRouteThroughEarpiece: false,
    });

    try {
      await recorder.prepareToRecordAsync(VOICE_RECORDING_OPTIONS);
      recorder.record();
      setRecording(true);
      devVoiceLog("startCapture:recording", { uri: recorder.uri || recorder.getStatus().url || null });
    } catch (error) {
      await resetAudioMode();
      devVoiceLog("startCapture:error", error instanceof Error ? error.message : String(error));
      throw error;
    }
  }, [activeServer, busy, connected, permissionStatus, recorder, recording, requestCapturePermission, resetAudioMode]);

  const stopAndTranscribe = useCallback(async (options: VoiceTranscribeOptions = {}): Promise<string> => {
    if (!recording && !recorderState.isRecording) {
      throw new Error("Voice capture has not started.");
    }

    setBusy(true);
    setRecording(false);
    setLastError(null);
    setMeteringDb(null);

    try {
      if (recorder.isRecording || recorderState.isRecording) {
        await recorder.stop();
      }

      await resetAudioMode();

      const uri = recorder.uri || recorder.getStatus().url;
      devVoiceLog("stopAndTranscribe:stopped", {
        uri,
        activeServer: activeServer?.name || null,
        connected,
        vadEnabled: options.vadEnabled === true,
      });
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
          type: TRANSCRIBE_AUDIO_MIME,
          name: "voice-input.m4a",
        } as unknown as Blob);
        form.append("audio_mime_type", TRANSCRIBE_AUDIO_MIME);
        form.append("audio_format", TRANSCRIBE_AUDIO_FORMAT);
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
          devVoiceLog("stopAndTranscribe:tryEndpoint", { endpoint, baseUrl, wakePhrase: Boolean(wakePhrase) });
          const response = await fetch(`${baseUrl}${endpoint}`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${activeServer.token}`,
            },
            body: form,
          });

          if (!response.ok) {
            if (response.status === 404 || response.status === 405 || response.status === 501) {
              devVoiceLog("stopAndTranscribe:endpointUnavailable", { endpoint, status: response.status });
              continue;
            }
            if (response.status === 415) {
              let detail = "";
              try {
                detail = (await response.text()).trim();
              } catch {
                detail = "";
              }
              lastHttpError = detail
                ? `HTTP 415 from ${endpoint}: ${detail}`
                : `HTTP 415 from ${endpoint}. Server rejected ${TRANSCRIBE_AUDIO_MIME}; expected format mismatch.`;
              devVoiceLog("stopAndTranscribe:unsupportedFormat", { endpoint, detail: lastHttpError });
              continue;
            }
            lastHttpError = `HTTP ${response.status} from ${endpoint}`;
            devVoiceLog("stopAndTranscribe:httpError", { endpoint, status: response.status });
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
            devVoiceLog("stopAndTranscribe:emptyTranscript", { endpoint });
            continue;
          }

          setLastTranscript(transcript);
          devVoiceLog("stopAndTranscribe:success", {
            endpoint,
            transcriptPreview: transcript.slice(0, 160),
          });
          return transcript;
        } catch (error) {
          lastHttpError = error instanceof Error ? error.message : String(error);
          devVoiceLog("stopAndTranscribe:networkError", { endpoint, error: lastHttpError });
        }
      }

      throw new Error(
        lastHttpError ||
          `No transcription endpoint found. Add one of: /voice/transcribe-vad, /voice/transcribe, /speech/transcribe, /ai/transcribe, /llm/transcribe. Expected upload format: ${TRANSCRIBE_AUDIO_MIME}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      devVoiceLog("stopAndTranscribe:error", message);
      throw error;
    } finally {
      await resetAudioMode();
      setBusy(false);
    }
  }, [activeServer, connected, recorder, recorderState.isRecording, recording, resetAudioMode]);

  const stopCapture = useCallback(async (): Promise<boolean> => {
    if (!recording && !recorderState.isRecording) {
      setRecording(false);
      setMeteringDb(null);
      await resetAudioMode();
      return false;
    }

    setRecording(false);
    setMeteringDb(null);
    try {
      await recorder.stop();
    } catch {
      // best effort
    }
    await resetAudioMode();
    return true;
  }, [recording, recorder, recorderState.isRecording, resetAudioMode]);

  useEffect(() => {
    return () => {
      void stopAndCleanupRecording(recorder).finally(() => {
        void resetAudioMode();
      });
    };
  }, [recorder, resetAudioMode]);

  return {
    recording,
    busy,
    lastTranscript,
    lastError,
    meteringDb,
    permissionStatus,
    requestCapturePermission,
    startCapture,
    stopCapture,
    stopAndTranscribe,
    setLastTranscript,
  };
}

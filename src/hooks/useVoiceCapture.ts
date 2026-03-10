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
import { useCallback, useEffect, useRef, useState } from "react";
import { Platform } from "react-native";
import type {
  ExpoSpeechRecognitionErrorEvent,
  ExpoSpeechRecognitionResultEvent,
} from "expo-speech-recognition";

import { normalizeBaseUrl } from "../api/client";
import { ServerProfile } from "../types";

const BASE_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe", "/speech/transcribe", "/ai/transcribe", "/llm/transcribe"];
const VAD_TRANSCRIBE_ENDPOINTS = ["/voice/transcribe-vad", "/speech/transcribe-vad", "/ai/transcribe-vad", "/llm/transcribe-vad"];
const TRANSCRIBE_AUDIO_MIME = "audio/m4a";
const TRANSCRIBE_AUDIO_FORMAT = "m4a-aac";
const NATIVE_TRANSCRIBE_TIMEOUT_MS = 30000;

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

type SpeechRecognitionModule = {
  isRecognitionAvailable: () => boolean;
  getStateAsync: () => Promise<"inactive" | "starting" | "recognizing" | "stopping">;
  requestPermissionsAsync: () => Promise<{ granted: boolean }>;
  requestMicrophonePermissionsAsync?: () => Promise<{ granted: boolean }>;
  requestSpeechRecognizerPermissionsAsync?: () => Promise<{ granted: boolean }>;
  addListener: (
    eventName: "result" | "error" | "end",
    listener: (event?: any) => void
  ) => { remove: () => void };
  start: (options: Record<string, unknown>) => void;
  stop?: () => void;
  abort: () => void;
};

type VoiceLiveRecognitionOptions = {
  onTranscript: (transcript: string) => void | Promise<void>;
  onNoSpeech?: () => void | Promise<void>;
  onError?: (message: string) => void | Promise<void>;
  contextualStrings?: string[];
};

let speechRecognitionModuleOverride: SpeechRecognitionModule | null = null;

function devVoiceLog(...args: Array<unknown>) {
  if (__DEV__) {
    console.log("[Voice]", ...args);
  }
}

function getSpeechRecognitionModule(): SpeechRecognitionModule {
  if (speechRecognitionModuleOverride) {
    return speechRecognitionModuleOverride;
  }
  try {
    // Lazy require keeps the app from crashing on old binaries that do not yet
    // include the native speech module.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const speechPackage = require("expo-speech-recognition") as {
      ExpoSpeechRecognitionModule?: SpeechRecognitionModule;
    };
    const module = speechPackage.ExpoSpeechRecognitionModule;
    if (!module) {
      throw new Error("expo-speech-recognition is unavailable.");
    }
    return module;
  } catch (error) {
    throw new Error(
      error instanceof Error
        ? `Native speech recognition is unavailable in this build: ${error.message}`
        : "Native speech recognition is unavailable in this build."
    );
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

function readSpeechRecognitionTranscript(event: ExpoSpeechRecognitionResultEvent | null | undefined): string {
  if (!event?.results?.length) {
    return "";
  }
  return event.results
    .map((item) => item?.transcript || "")
    .filter((item) => item.trim().length > 0)
    .join("\n")
    .trim();
}

async function transcribeWithNativeSpeech(uri: string): Promise<string> {
  if (!uri.trim()) {
    throw new Error("Audio capture failed before native speech transcription started.");
  }
  const speechRecognitionModule = getSpeechRecognitionModule();
  if (!speechRecognitionModule.isRecognitionAvailable()) {
    throw new Error("Native speech recognition is unavailable on this device.");
  }

  try {
    const state = await speechRecognitionModule.getStateAsync();
    if (state !== "inactive") {
      speechRecognitionModule.abort();
    }
  } catch {
    // best effort
  }

  const permission = await speechRecognitionModule.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Speech recognition permission is required for voice transcription.");
  }

  return await new Promise<string>((resolve, reject) => {
    let finished = false;
    let latestTranscript = "";
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      resultSubscription.remove();
      errorSubscription.remove();
      endSubscription.remove();
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const settle = (kind: "resolve" | "reject", value: string | Error) => {
      if (finished) {
        return;
      }
      finished = true;
      cleanup();
      if (kind === "resolve") {
        resolve(value as string);
      } else {
        reject(value instanceof Error ? value : new Error(String(value)));
      }
    };

    const resultSubscription = speechRecognitionModule.addListener("result", (event) => {
      const transcript = readSpeechRecognitionTranscript(event);
      if (!transcript) {
        return;
      }
      latestTranscript = transcript;
      devVoiceLog("stopAndTranscribe:nativeResult", {
        isFinal: event.isFinal,
        transcriptPreview: transcript.slice(0, 160),
      });
      if (event.isFinal) {
        settle("resolve", transcript);
      }
    });

    const errorSubscription = speechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
      devVoiceLog("stopAndTranscribe:nativeError", {
        code: event.error,
        message: event.message,
      });
      settle("reject", new Error(event.message || `Native speech recognition failed: ${event.error}`));
    });

    const endSubscription = speechRecognitionModule.addListener("end", () => {
      if (latestTranscript.trim()) {
        settle("resolve", latestTranscript.trim());
        return;
      }
      settle("reject", new Error("Native speech recognition returned no transcript."));
    });

    timeoutId = setTimeout(() => {
      try {
        speechRecognitionModule.abort();
      } catch {
        // best effort
      }
      settle("reject", new Error("Native speech recognition timed out."));
    }, NATIVE_TRANSCRIBE_TIMEOUT_MS);

    try {
      devVoiceLog("stopAndTranscribe:tryNativeFallback", { uri, platform: Platform.OS });
      speechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: Platform.OS === "ios",
        addsPunctuation: true,
        audioSource: {
          uri,
        },
      });
    } catch (error) {
      settle("reject", error instanceof Error ? error : new Error(String(error)));
    }
  });
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
  const [liveRecognitionActive, setLiveRecognitionActive] = useState<boolean>(false);
  const [lastTranscript, setLastTranscript] = useState<string>("");
  const [lastError, setLastError] = useState<string | null>(null);
  const [meteringDb, setMeteringDb] = useState<number | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<VoicePermissionStatus>(null);
  const liveRecognitionRunRef = useRef<number>(0);
  const liveRecognitionSubscriptionsRef = useRef<Array<{ remove: () => void }>>([]);

  const clearLiveRecognitionSubscriptions = useCallback(() => {
    if (!liveRecognitionSubscriptionsRef.current.length) {
      return;
    }
    for (const subscription of liveRecognitionSubscriptionsRef.current) {
      try {
        subscription.remove();
      } catch {
        // best effort
      }
    }
    liveRecognitionSubscriptionsRef.current = [];
  }, []);

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

  const requestLiveRecognitionPermission = useCallback(async () => {
    const speechRecognitionModule = getSpeechRecognitionModule();
    if (Platform.OS === "ios") {
      const microphonePermission = speechRecognitionModule.requestMicrophonePermissionsAsync
        ? await speechRecognitionModule.requestMicrophonePermissionsAsync()
        : await speechRecognitionModule.requestPermissionsAsync();
      if (!microphonePermission.granted) {
        throw new Error("Microphone permission is required for Nova voice.");
      }
      return true;
    }
    const permission = await speechRecognitionModule.requestPermissionsAsync();
    if (!permission.granted) {
      throw new Error("Speech recognition permission is required for Nova voice.");
    }
    return true;
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

  const stopLiveRecognition = useCallback(
    async (mode: "stop" | "abort" = "stop") => {
      try {
        const speechRecognitionModule = getSpeechRecognitionModule();
        if (mode === "abort") {
          liveRecognitionRunRef.current += 1;
          clearLiveRecognitionSubscriptions();
          setLiveRecognitionActive(false);
          speechRecognitionModule.abort();
          return;
        }
        if (speechRecognitionModule.stop) {
          speechRecognitionModule.stop();
        } else {
          liveRecognitionRunRef.current += 1;
          clearLiveRecognitionSubscriptions();
          setLiveRecognitionActive(false);
          speechRecognitionModule.abort();
        }
      } catch {
        // best effort
      }
    },
    [clearLiveRecognitionSubscriptions]
  );

  const startLiveRecognition = useCallback(
    async ({ onTranscript, onNoSpeech, onError, contextualStrings }: VoiceLiveRecognitionOptions) => {
      const speechRecognitionModule = getSpeechRecognitionModule();
      if (!speechRecognitionModule.isRecognitionAvailable()) {
        throw new Error("Native speech recognition is unavailable on this device.");
      }

      await requestLiveRecognitionPermission();

      clearLiveRecognitionSubscriptions();
      try {
        const state = await speechRecognitionModule.getStateAsync();
        if (state !== "inactive") {
          speechRecognitionModule.abort();
        }
      } catch {
        // best effort
      }

      setLastError(null);
      setLastTranscript("");
      setBusy(false);
      setLiveRecognitionActive(true);

      const runId = liveRecognitionRunRef.current + 1;
      liveRecognitionRunRef.current = runId;
      let finished = false;
      let latestTranscript = "";

      const settle = (kind: "transcript" | "nospeech" | "error", value?: string) => {
        if (finished || liveRecognitionRunRef.current !== runId) {
          return;
        }
        finished = true;
        setLiveRecognitionActive(false);
        clearLiveRecognitionSubscriptions();

        if (kind === "transcript") {
          const transcript = String(value || "").trim();
          if (!transcript) {
            void Promise.resolve(onNoSpeech?.()).catch(() => undefined);
            return;
          }
          setLastTranscript(transcript);
          void Promise.resolve(onTranscript(transcript)).catch((error) => {
            const message = error instanceof Error ? error.message : String(error);
            setLastError(message);
            void Promise.resolve(onError?.(message)).catch(() => undefined);
          });
          return;
        }

        if (kind === "nospeech") {
          void Promise.resolve(onNoSpeech?.()).catch(() => undefined);
          return;
        }

        const message = String(value || "Speech recognition failed.");
        setLastError(message);
        void Promise.resolve(onError?.(message)).catch(() => undefined);
      };

      liveRecognitionSubscriptionsRef.current = [
        speechRecognitionModule.addListener("result", (event: ExpoSpeechRecognitionResultEvent) => {
          const transcript = readSpeechRecognitionTranscript(event);
          if (!transcript) {
            return;
          }
          latestTranscript = transcript.trim();
          setLastTranscript(latestTranscript);
          devVoiceLog("liveRecognition:result", {
            isFinal: event.isFinal,
            transcriptPreview: latestTranscript.slice(0, 160),
          });
          if (event.isFinal) {
            settle("transcript", latestTranscript);
          }
        }),
        speechRecognitionModule.addListener("error", (event: ExpoSpeechRecognitionErrorEvent) => {
          devVoiceLog("liveRecognition:error", {
            code: event.error,
            message: event.message,
          });
          settle("error", event.message || `Speech recognition failed: ${event.error}`);
        }),
        speechRecognitionModule.addListener("end", () => {
          devVoiceLog("liveRecognition:end", {
            transcriptPreview: latestTranscript.slice(0, 160),
          });
          if (latestTranscript.trim()) {
            settle("transcript", latestTranscript.trim());
            return;
          }
          settle("nospeech");
        }),
      ];

      devVoiceLog("liveRecognition:start", {
        platform: Platform.OS,
        contextualStrings: contextualStrings?.slice(0, 8) || [],
      });
      speechRecognitionModule.start({
        lang: "en-US",
        interimResults: true,
        maxAlternatives: 1,
        continuous: false,
        requiresOnDeviceRecognition: Platform.OS === "ios",
        addsPunctuation: true,
        iosTaskHint: "confirmation",
        iosVoiceProcessingEnabled: true,
        contextualStrings: contextualStrings?.length ? contextualStrings : undefined,
      });
    },
    [clearLiveRecognitionSubscriptions, requestLiveRecognitionPermission]
  );

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
      let lastHttpError: string | null = null;

      if (activeServer && connected) {
        const baseUrl = normalizeBaseUrl(activeServer.baseUrl);

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
      } else {
        lastHttpError = "No connected server transcription path is available.";
      }

      try {
        const transcript = await transcribeWithNativeSpeech(uri);
        setLastTranscript(transcript);
        devVoiceLog("stopAndTranscribe:nativeSuccess", {
          transcriptPreview: transcript.slice(0, 160),
        });
        return transcript;
      } catch (nativeError) {
        const nativeMessage = nativeError instanceof Error ? nativeError.message : String(nativeError);
        devVoiceLog("stopAndTranscribe:nativeFallbackFailed", nativeMessage);
        throw new Error(
          lastHttpError
            ? `${lastHttpError} Native fallback failed: ${nativeMessage}`
            : nativeMessage
        );
      }
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
      liveRecognitionRunRef.current += 1;
      clearLiveRecognitionSubscriptions();
      void stopAndCleanupRecording(recorder).finally(() => {
        void resetAudioMode();
      });
    };
  }, [clearLiveRecognitionSubscriptions, recorder, resetAudioMode]);

  return {
    recording,
    busy,
    liveRecognitionActive,
    lastTranscript,
    lastError,
    meteringDb,
    permissionStatus,
    requestCapturePermission,
    requestLiveRecognitionPermission,
    startCapture,
    startLiveRecognition,
    stopCapture,
    stopLiveRecognition,
    stopAndTranscribe,
    setLastTranscript,
  };
}

export const voiceCaptureTestUtils = {
  readTranscript,
  readSpeechRecognitionTranscript,
  transcribeWithNativeSpeech,
  setSpeechRecognitionModuleOverride(module: SpeechRecognitionModule | null) {
    speechRecognitionModuleOverride = module;
  },
};

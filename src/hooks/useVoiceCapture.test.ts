import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type SpeechEventName = "result" | "error" | "end";
type SpeechListener = (event?: any) => void;

const speechListeners = new Map<SpeechEventName, Set<SpeechListener>>([
  ["result", new Set()],
  ["error", new Set()],
  ["end", new Set()],
]);

const speechModuleMock = vi.hoisted(() => ({
  isRecognitionAvailable: vi.fn(() => true),
  getStateAsync: vi.fn(async () => "inactive"),
  requestPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: "granted",
    canAskAgain: true,
    expires: "never",
  })),
  addListener: vi.fn((eventName: SpeechEventName, listener: SpeechListener) => {
    speechListeners.get(eventName)?.add(listener);
    return {
      remove: () => {
        speechListeners.get(eventName)?.delete(listener);
      },
    };
  }),
  start: vi.fn(),
  abort: vi.fn(),
}));

vi.mock("expo-audio", () => ({
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  getRecordingPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: "granted",
    canAskAgain: true,
  })),
  requestRecordingPermissionsAsync: vi.fn(async () => ({
    granted: true,
    status: "granted",
    canAskAgain: true,
  })),
  setAudioModeAsync: vi.fn(async () => undefined),
  useAudioRecorder: vi.fn(() => ({
    isRecording: false,
    prepareToRecordAsync: vi.fn(async () => undefined),
    record: vi.fn(),
    stop: vi.fn(async () => undefined),
    getStatus: vi.fn(() => ({ url: null })),
    uri: null,
  })),
  useAudioRecorderState: vi.fn(() => ({
    isRecording: false,
    metering: null,
  })),
}));

vi.mock("expo-speech-recognition", () => ({
  ExpoSpeechRecognitionModule: speechModuleMock,
}));

vi.mock("react-native", () => ({
  Platform: {
    OS: "ios",
  },
}));

vi.stubGlobal("__DEV__", false);

import { voiceCaptureTestUtils } from "./useVoiceCapture";

function emitSpeechEvent(eventName: SpeechEventName, payload?: unknown) {
  speechListeners.get(eventName)?.forEach((listener) => listener(payload));
}

beforeEach(() => {
  speechListeners.forEach((listeners) => listeners.clear());
  voiceCaptureTestUtils.setSpeechRecognitionModuleOverride(speechModuleMock as unknown as Parameters<typeof voiceCaptureTestUtils.setSpeechRecognitionModuleOverride>[0]);
  speechModuleMock.isRecognitionAvailable.mockReturnValue(true);
  speechModuleMock.getStateAsync.mockResolvedValue("inactive");
  speechModuleMock.requestPermissionsAsync.mockResolvedValue({
    granted: true,
    status: "granted",
    canAskAgain: true,
    expires: "never",
  });
  speechModuleMock.start.mockImplementation(() => {
    queueMicrotask(() => {
      emitSpeechEvent("result", {
        isFinal: true,
        results: [{ transcript: "native transcript", confidence: 0.92, segments: [] }],
      });
      emitSpeechEvent("end");
    });
  });
  speechModuleMock.abort.mockImplementation(() => undefined);
});

afterEach(() => {
  voiceCaptureTestUtils.setSpeechRecognitionModuleOverride(null);
  vi.clearAllMocks();
});

describe("voiceCaptureTestUtils", () => {
  it("extracts a native speech transcript", () => {
    expect(
      voiceCaptureTestUtils.readSpeechRecognitionTranscript({
        isFinal: true,
        results: [
          { transcript: "hello", confidence: 1, segments: [] },
          { transcript: "world", confidence: 1, segments: [] },
        ],
      })
    ).toBe("hello\nworld");
  });

  it("transcribes audio through native speech fallback", async () => {
    const transcript = await voiceCaptureTestUtils.transcribeWithNativeSpeech("file:///tmp/voice-input.m4a");

    expect(transcript).toBe("native transcript");
    expect(speechModuleMock.requestPermissionsAsync).toHaveBeenCalledTimes(1);
    expect(speechModuleMock.start).toHaveBeenCalledWith(
      expect.objectContaining({
        lang: "en-US",
        audioSource: {
          uri: "file:///tmp/voice-input.m4a",
        },
      })
    );
  });

  it("fails when speech recognition permission is denied", async () => {
    speechModuleMock.requestPermissionsAsync.mockResolvedValueOnce({
      granted: false,
      status: "denied",
      canAskAgain: false,
      expires: "never",
    });

    await expect(
      voiceCaptureTestUtils.transcribeWithNativeSpeech("file:///tmp/voice-input.m4a")
    ).rejects.toThrow("Speech recognition permission is required for voice transcription.");
  });
});

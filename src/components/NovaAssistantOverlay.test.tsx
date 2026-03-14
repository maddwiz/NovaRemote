import React from "react";
import * as ReactNative from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { NovaAssistantMessage } from "../novaAssistant";
import { NovaAssistantOverlay } from "./NovaAssistantOverlay";

vi.mock("expo-haptics", () => ({
  impactAsync: vi.fn(async () => undefined),
  ImpactFeedbackStyle: {
    Medium: "Medium",
  },
}));

vi.mock("../branding", () => ({
  BRAND_LOGO: 1,
}));

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function buildMessage(id: string, role: "user" | "assistant", content: string): NovaAssistantMessage {
  return {
    id,
    role,
    content,
    createdAt: new Date().toISOString(),
  };
}

function buildProps(overrides: Partial<React.ComponentProps<typeof NovaAssistantOverlay>> = {}): React.ComponentProps<typeof NovaAssistantOverlay> {
  return {
    messages: [
      buildMessage("m1", "assistant", "Hi there"),
      buildMessage("m2", "user", "Show me the latest update"),
    ],
    draft: "",
    busy: false,
    lastError: null,
    activeProfileName: "OpenAI",
    canSend: true,
    voiceRecording: false,
    voiceBusy: false,
    listeningActive: false,
    handsFreeEnabled: false,
    voiceModeEnabled: false,
    wakePhrase: "hey nova",
    openRequestToken: 1,
    onSetDraft: vi.fn(),
    onSend: vi.fn(),
    onClose: vi.fn(),
    onClearConversation: vi.fn(),
    onOpenProviders: vi.fn(),
    onSetHandsFreeEnabled: vi.fn(),
    onToggleVoiceMode: vi.fn(),
    onVoiceHoldStart: vi.fn(),
    onVoiceHoldEnd: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => {
    callback(0);
    return 1;
  });
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("NovaAssistantOverlay", () => {
  it("auto-scrolls when new messages arrive while the transcript is already at the bottom", async () => {
    const scrollToEnd = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(<NovaAssistantOverlay {...buildProps()} />, {
        createNodeMock: (element) => (element.type === "ScrollView" ? { scrollToEnd } : null),
      });
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }

    const mountedRenderer = renderer as TestRenderer.ReactTestRenderer;
    const root = mountedRenderer.root;
    const transcript = root.findByType(ReactNative.ScrollView);

    act(() => {
      transcript.props.onLayout({
        nativeEvent: {
          layout: { height: 180 },
        },
      });
      transcript.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 220 },
          layoutMeasurement: { height: 180 },
          contentSize: { height: 400 },
        },
      });
    });

    scrollToEnd.mockClear();

    await act(async () => {
      mountedRenderer.update(
        <NovaAssistantOverlay
          {...buildProps({
            messages: [
              buildMessage("m1", "assistant", "Hi there"),
              buildMessage("m2", "user", "Show me the latest update"),
              buildMessage("m3", "assistant", "Here is the latest update."),
            ],
          })}
        />
      );
    });

    const updatedTranscript = mountedRenderer.root.findByType(ReactNative.ScrollView);
    act(() => {
      updatedTranscript.props.onContentSizeChange(320, 520);
    });

    expect(scrollToEnd).toHaveBeenCalledWith({ animated: true });

    await act(async () => {
      mountedRenderer.unmount();
    });
  });

  it("does not auto-scroll when the user has scrolled up to read older messages", async () => {
    const scrollToEnd = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(<NovaAssistantOverlay {...buildProps()} />, {
        createNodeMock: (element) => (element.type === "ScrollView" ? { scrollToEnd } : null),
      });
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }

    const mountedRenderer = renderer as TestRenderer.ReactTestRenderer;
    const root = mountedRenderer.root;
    const transcript = root.findByType(ReactNative.ScrollView);

    act(() => {
      transcript.props.onLayout({
        nativeEvent: {
          layout: { height: 180 },
        },
      });
      transcript.props.onScrollBeginDrag();
      transcript.props.onScroll({
        nativeEvent: {
          contentOffset: { y: 40 },
          layoutMeasurement: { height: 180 },
          contentSize: { height: 640 },
        },
      });
      transcript.props.onScrollEndDrag();
    });

    scrollToEnd.mockClear();

    await act(async () => {
      mountedRenderer.update(
        <NovaAssistantOverlay
          {...buildProps({
            messages: [
              buildMessage("m1", "assistant", "Hi there"),
              buildMessage("m2", "user", "Show me the latest update"),
              buildMessage("m3", "assistant", "Here is the latest update."),
            ],
          })}
        />
      );
    });

    const updatedTranscript = mountedRenderer.root.findByType(ReactNative.ScrollView);
    act(() => {
      updatedTranscript.props.onContentSizeChange(320, 760);
    });

    expect(scrollToEnd).not.toHaveBeenCalled();

    await act(async () => {
      mountedRenderer.unmount();
    });
  });
});

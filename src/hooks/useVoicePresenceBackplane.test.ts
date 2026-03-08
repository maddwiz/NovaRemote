import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useVoicePresenceBackplane } from "./useVoicePresenceBackplane";

class MockSocket {
  readyState = 0;
  onopen: ((event: unknown) => void) | null = null;
  onmessage: ((event: { data?: unknown }) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  onclose: ((event: unknown) => void) | null = null;
  sent: string[] = [];

  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  emit(payload: unknown) {
    this.onmessage?.({ data: JSON.stringify(payload) });
  }

  send(data: string) {
    this.sent.push(data);
  }

  close() {
    this.readyState = 3;
    this.onclose?.({});
  }
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("useVoicePresenceBackplane", () => {
  it("stays disabled when endpoint is not configured", async () => {
    let latest: ReturnType<typeof useVoicePresenceBackplane> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVoicePresenceBackplane({
        enabled: true,
        endpoint: "",
        participantId: "local-user",
        joinedChannels: [],
        onRemotePresence: () => {},
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    expect(current().status).toBe("disabled");
    expect(current().lastError).toBeNull();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("connects, sends auth/sync, and forwards remote presence", async () => {
    const socket = new MockSocket();
    const socketFactory = () => socket;
    const onRemotePresence = vi.fn();
    let latest: ReturnType<typeof useVoicePresenceBackplane> | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVoicePresenceBackplane({
        enabled: true,
        endpoint: "wss://voice.example/socket",
        token: "token-123",
        participantId: "local-user",
        joinedChannels: [
          {
            channelId: "voice-1",
            workspaceId: "workspace-a",
            activeParticipantIds: ["local-user"],
            activeSpeakerId: null,
            muted: false,
          },
        ],
        onRemotePresence,
        socketFactory,
      });
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      socket.open();
    });

    expect(current().status).toBe("connected");
    expect(socket.sent.some((payload) => payload.includes("\"type\":\"auth\""))).toBe(true);
    expect(socket.sent.some((payload) => payload.includes("\"type\":\"sync\""))).toBe(true);
    expect(socket.sent.some((payload) => payload.includes("\"channelId\":\"voice-1\""))).toBe(true);

    await act(async () => {
      socket.emit({
        type: "presence_sync",
        channelId: "voice-1",
        participantIds: ["remote-1", "remote-2"],
        activeSpeakerId: "remote-2",
      });
    });

    expect(onRemotePresence).toHaveBeenCalledWith({
      channelId: "voice-1",
      participantIds: ["remote-1", "remote-2"],
      activeSpeakerId: "remote-2",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });
});

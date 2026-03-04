import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const secureStoreMock = vi.hoisted(() => {
  const storage = new Map<string, string>();
  let idCounter = 0;
  return {
    storage,
    resetIds: () => {
      idCounter = 0;
    },
    getItemAsync: vi.fn(async (key: string) => storage.get(key) ?? null),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      storage.set(key, value);
    }),
    makeId: () => {
      idCounter += 1;
      return `id-test-${idCounter}`;
    },
  };
});

vi.mock("expo-secure-store", () => ({
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
}));

vi.mock("../constants", () => ({
  STORAGE_VOICE_CHANNELS: "novaremote.voice_channels.v1",
  makeId: secureStoreMock.makeId,
}));

import { UseVoiceChannelsResult, useVoiceChannels, voiceChannelsTestUtils } from "./useVoiceChannels";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  secureStoreMock.storage.clear();
  secureStoreMock.resetIds();
  secureStoreMock.getItemAsync.mockClear();
  secureStoreMock.setItemAsync.mockClear();
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

describe("voice channel helpers", () => {
  it("normalizes names and channels", () => {
    expect(voiceChannelsTestUtils.normalizeChannelName("  Team   Alpha ")).toBe("Team Alpha");
    expect(
      voiceChannelsTestUtils.normalizeVoiceChannel(
        {
          id: "voice-1",
          workspaceId: "workspace-1",
          name: "Ops",
          joined: true,
        }
      )?.workspaceId
    ).toBe("workspace-1");
  });
});

describe("useVoiceChannels", () => {
  it("creates and joins channels by workspace", async () => {
    let latest: UseVoiceChannelsResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVoiceChannels();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().createChannel({ workspaceId: "workspace-a", name: "General" });
      current().createChannel({ workspaceId: "workspace-a", name: "Pairing" });
      current().createChannel({ workspaceId: "workspace-b", name: "Ops" });
    });

    const channels = current().channels;
    expect(channels).toHaveLength(3);

    await act(async () => {
      const pairing = channels.find((channel) => channel.workspaceId === "workspace-a" && channel.name === "Pairing");
      current().joinChannel(pairing?.id || "");
    });

    const joinedWorkspaceA = current().channels.filter((channel) => channel.workspaceId === "workspace-a" && channel.joined);
    expect(joinedWorkspaceA).toHaveLength(1);
    expect(joinedWorkspaceA[0]?.name).toBe("Pairing");

    await act(async () => {
      const ops = current().channels.find((channel) => channel.workspaceId === "workspace-b" && channel.name === "Ops");
      current().joinChannel(ops?.id || "");
    });

    const joinedWorkspaceB = current().channels.filter((channel) => channel.workspaceId === "workspace-b" && channel.joined);
    expect(joinedWorkspaceB).toHaveLength(1);
    expect(joinedWorkspaceB[0]?.name).toBe("Ops");

    await act(async () => {
      const general = current().channels.find((channel) => channel.workspaceId === "workspace-a" && channel.name === "General");
      current().joinChannel(general?.id || "");
    });

    const joinedAfterSwitch = current().channels.filter((channel) => channel.workspaceId === "workspace-a" && channel.joined);
    expect(joinedAfterSwitch).toHaveLength(1);
    expect(joinedAfterSwitch[0]?.name).toBe("General");
    expect(secureStoreMock.setItemAsync).toHaveBeenCalled();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("toggles mute and leaves channel", async () => {
    let latest: UseVoiceChannelsResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVoiceChannels();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().createChannel({ workspaceId: "workspace-a", name: "General" });
    });

    const channelId = current().channels[0]?.id || "";

    await act(async () => {
      current().joinChannel(channelId);
      current().toggleMute(channelId);
    });

    expect(current().channels[0]?.joined).toBe(true);
    expect(current().channels[0]?.muted).toBe(true);

    await act(async () => {
      current().leaveChannel(channelId);
    });

    expect(current().channels[0]?.joined).toBe(false);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("prunes channels for deleted workspaces", async () => {
    let latest: UseVoiceChannelsResult | null = null;
    const current = () => {
      if (!latest) {
        throw new Error("Hook not ready");
      }
      return latest;
    };

    function Harness() {
      latest = useVoiceChannels();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });

    await act(async () => {
      current().createChannel({ workspaceId: "workspace-a", name: "General" });
      current().createChannel({ workspaceId: "workspace-b", name: "Ops" });
    });

    expect(current().channels.map((channel) => channel.workspaceId)).toEqual(["workspace-a", "workspace-b"]);

    await act(async () => {
      current().pruneWorkspaceChannels(["workspace-a"]);
    });

    expect(current().channels).toHaveLength(1);
    expect(current().channels[0]?.workspaceId).toBe("workspace-a");

    await act(async () => {
      renderer?.unmount();
    });
  });
});

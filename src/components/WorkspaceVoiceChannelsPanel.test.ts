import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SharedWorkspace, VoiceChannel } from "../types";
import { WorkspaceVoiceChannelsPanel } from "./WorkspaceVoiceChannelsPanel";

function makeWorkspace(overrides: Partial<SharedWorkspace> = {}): SharedWorkspace {
  return {
    id: "workspace-1",
    name: "Platform Ops",
    serverIds: ["dgx"],
    members: [{ id: "local-user", name: "Local User", role: "owner" }],
    channelId: "channel-workspace-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function makeChannel(overrides: Partial<VoiceChannel> = {}): VoiceChannel {
  return {
    id: "voice-1",
    workspaceId: "workspace-1",
    name: "incident",
    joined: false,
    muted: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
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

describe("WorkspaceVoiceChannelsPanel", () => {
  it("allows owners to create and delete channels", async () => {
    const onCreateChannel = vi.fn((workspaceId: string, name: string) => makeChannel({ workspaceId, name }));
    const onDeleteChannel = vi.fn();
    const onJoinChannel = vi.fn();
    const onLeaveChannel = vi.fn();
    const onToggleMute = vi.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WorkspaceVoiceChannelsPanel, {
          workspaces: [makeWorkspace()],
          channels: [makeChannel()],
          loading: false,
          onCreateChannel,
          onDeleteChannel,
          onJoinChannel,
          onLeaveChannel,
          onToggleMute,
          onOpenServers: vi.fn(),
        })
      );
    });
    expect(() => renderer.root.findByProps({ children: "Members: Local User (owner)" })).not.toThrow();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "New voice channel for Platform Ops" }).props.onChangeText("triage");
    });
    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Create voice channel for Platform Ops" }).props.onPress();
    });
    expect(onCreateChannel).toHaveBeenCalledWith("workspace-1", "triage");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Delete voice channel incident" }).props.onPress();
    });
    expect(onDeleteChannel).toHaveBeenCalledWith("voice-1");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("blocks management controls for viewer workspaces", async () => {
    const onCreateChannel = vi.fn();
    const onDeleteChannel = vi.fn();
    const onJoinChannel = vi.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WorkspaceVoiceChannelsPanel, {
          workspaces: [
            makeWorkspace({
              id: "workspace-viewer",
              name: "Viewer Space",
              members: [{ id: "local-user", name: "Local User", role: "viewer" }],
            }),
          ],
          channels: [
            makeChannel({
              id: "voice-viewer-1",
              workspaceId: "workspace-viewer",
              name: "ops",
            }),
          ],
          loading: false,
          onCreateChannel,
          onDeleteChannel,
          onJoinChannel,
          onLeaveChannel: vi.fn(),
          onToggleMute: vi.fn(),
          onOpenServers: vi.fn(),
        })
      );
    });

    expect(() => renderer.root.findByProps({ children: "Only owners or editors can manage channels." })).not.toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Create voice channel for Viewer Space" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Delete voice channel ops" })).toThrow();

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Join voice channel ops" }).props.onPress();
    });
    expect(onJoinChannel).toHaveBeenCalledWith("voice-viewer-1");
    expect(onCreateChannel).not.toHaveBeenCalled();
    expect(onDeleteChannel).not.toHaveBeenCalled();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("routes mute and leave actions for joined channels", async () => {
    const onLeaveChannel = vi.fn();
    const onToggleMute = vi.fn();

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WorkspaceVoiceChannelsPanel, {
          workspaces: [makeWorkspace()],
          channels: [makeChannel({ id: "voice-joined", name: "release", joined: true, muted: true })],
          loading: false,
          onCreateChannel: vi.fn(),
          onDeleteChannel: vi.fn(),
          onJoinChannel: vi.fn(),
          onLeaveChannel,
          onToggleMute,
          onOpenServers: vi.fn(),
        })
      );
    });

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Unmute joined channel release" }).props.onPress();
    });
    expect(onToggleMute).toHaveBeenCalledWith("voice-joined");

    await act(async () => {
      renderer.root.findByProps({ accessibilityLabel: "Leave joined channel release" }).props.onPress();
    });
    expect(onLeaveChannel).toHaveBeenCalledWith("voice-joined");

    await act(async () => {
      renderer.unmount();
    });
  });

  it("renders participant display names for active speaker labels", async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        React.createElement(WorkspaceVoiceChannelsPanel, {
          workspaces: [makeWorkspace()],
          channels: [
            makeChannel({
              id: "voice-joined",
              name: "release",
              joined: true,
              muted: false,
              activeSpeakerId: "engineer-2",
              activeParticipantIds: ["local-user", "engineer-2"],
            }),
          ],
          loading: false,
          onCreateChannel: vi.fn(),
          onDeleteChannel: vi.fn(),
          onJoinChannel: vi.fn(),
          onLeaveChannel: vi.fn(),
          onToggleMute: vi.fn(),
          participantDirectory: {
            "engineer-2": {
              id: "engineer-2",
              name: "Engineer Two",
              role: "editor",
              lastSeenAt: 1000,
              isSelf: false,
            },
          },
          onOpenServers: vi.fn(),
        })
      );
    });

    expect(() =>
      renderer.root.findByProps({
        children: "Active speaker: Engineer Two (editor)",
      })
    ).not.toThrow();

    await act(async () => {
      renderer.unmount();
    });
  });
});

import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { Alert } from "react-native";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

import { ServerConnection, ServerProfile } from "../types";
import { ServerSwitcherRail } from "./ServerSwitcherRail";

function makeServer(id: string, name: string, overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
    ...overrides,
  };
}

function makeConnection(
  server: ServerProfile,
  status: ServerConnection["status"],
  options: { connected?: boolean; openSessions?: string[] } = {}
): ServerConnection {
  const openSessions = options.openSessions || ["main"];
  return {
    server,
    connected: options.connected ?? true,
    capabilities: {
      terminal: true,
      tmux: true,
      codex: false,
      files: false,
      shellRun: false,
      macAttach: false,
      stream: true,
      sysStats: false,
      processes: false,
      collaboration: false,
      spectate: false,
    },
    terminalApiBasePath: "/tmux",
    capabilitiesLoading: false,
    allSessions: openSessions,
    localAiSessions: [],
    openSessions,
    tails: {},
    drafts: {},
    sendBusy: {},
    sendModes: {},
    streamLive: {},
    connectionMeta: {},
    health: {
      lastPingAt: null,
      latencyMs: null,
      activeStreams: 0,
      openSessions: openSessions.length,
    },
    status,
    lastError: null,
    activeStreamCount: 0,
  };
}

let alertSpy: ReturnType<typeof vi.spyOn> | null = null;
let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
  alertSpy = vi.spyOn(Alert, "alert").mockImplementation(() => {});
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
  alertSpy?.mockRestore();
  alertSpy = null;
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("ServerSwitcherRail", () => {
  async function renderRail(
    props: React.ComponentProps<typeof ServerSwitcherRail>
  ): Promise<TestRenderer.ReactTestRenderer> {
    let renderer: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ServerSwitcherRail, props));
    });
    return renderer!;
  }

  it("renders server chips and add button", async () => {
    const dgx = makeServer("dgx", "DGX");
    const lab = makeServer("lab", "Lab");
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, "connected")],
      [lab.id, makeConnection(lab, "connecting")],
    ]);

    const renderer = await renderRail({
      servers: [dgx, lab],
      connections,
      focusedServerId: dgx.id,
      onFocusServer: () => {},
      onAddServer: () => {},
      unreadServers: new Set([lab.id]),
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to Lab" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Add server" })).toBeDefined();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("calls onFocusServer when tapping a server chip", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([[dgx.id, makeConnection(dgx, "connected")]]);
    const onFocusServer = vi.fn();

    const renderer = await renderRail({
      servers: [dgx],
      connections,
      focusedServerId: null,
      onFocusServer,
      onAddServer: () => {},
      unreadServers: new Set(),
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" }).props.onPress();
    });

    expect(onFocusServer).toHaveBeenCalledWith(dgx.id);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("routes long-press chip menu actions to reconnect and edit callbacks", async () => {
    const dgx = makeServer("dgx", "DGX");
    const connections = new Map<string, ServerConnection>([[dgx.id, makeConnection(dgx, "connected")]]);
    const onReconnectServer = vi.fn();
    const onEditServer = vi.fn();

    const renderer = await renderRail({
      servers: [dgx],
      connections,
      focusedServerId: dgx.id,
      onFocusServer: () => {},
      onReconnectServer,
      onEditServer,
      onAddServer: () => {},
      unreadServers: new Set(),
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" }).props.onLongPress();
    });

    expect(alertSpy).toHaveBeenCalledTimes(1);
    const actions = (alertSpy?.mock.calls[0]?.[2] || []) as Array<{ text?: string; onPress?: () => void }>;
    expect(actions.map((action) => action.text)).toEqual(["Reconnect", "View Details", "Edit Server", "Cancel"]);

    act(() => {
      actions[0]?.onPress?.();
      actions[2]?.onPress?.();
    });

    expect(onReconnectServer).toHaveBeenCalledWith(dgx.id);
    expect(onEditServer).toHaveBeenCalledWith(dgx.id);

    await act(async () => {
      renderer.unmount();
    });
  });

  it("uses host-level reconnect action to call onReconnectServers", async () => {
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A", vmType: "proxmox" });
    const lab = makeServer("lab", "Lab", { vmHost: "Rack A", vmType: "qemu" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, "connected")],
      [lab.id, makeConnection(lab, "connected")],
    ]);
    const onReconnectServers = vi.fn();

    const renderer = await renderRail({
      servers: [dgx, lab],
      connections,
      focusedServerId: dgx.id,
      onFocusServer: () => {},
      onReconnectServers,
      onAddServer: () => {},
      unreadServers: new Set(),
    });

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Focus Rack A host" }).props.onLongPress();
    });

    const actions = (alertSpy?.mock.calls[0]?.[2] || []) as Array<{ text?: string; onPress?: () => void }>;
    expect(actions.map((action) => action.text)).toEqual([
      "Reconnect Host",
      "Focus First Server",
      "View Host Details",
      "Cancel",
    ]);

    act(() => {
      actions[0]?.onPress?.();
    });

    expect(onReconnectServers).toHaveBeenCalledTimes(1);
    expect(new Set(onReconnectServers.mock.calls[0]?.[0] as string[])).toEqual(new Set([dgx.id, lab.id]));

    await act(async () => {
      renderer.unmount();
    });
  });

  it("collapses and expands host groups from the header action", async () => {
    const dgx = makeServer("dgx", "DGX", { vmHost: "Rack A", vmType: "proxmox" });
    const lab = makeServer("lab", "Lab", { vmHost: "Rack A", vmType: "qemu" });
    const connections = new Map<string, ServerConnection>([
      [dgx.id, makeConnection(dgx, "connected")],
      [lab.id, makeConnection(lab, "connected")],
    ]);

    const renderer = await renderRail({
      servers: [dgx, lab],
      connections,
      focusedServerId: dgx.id,
      onFocusServer: () => {},
      onAddServer: () => {},
      unreadServers: new Set(),
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to Lab" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Focus Rack A host" }).props.onPress();
    });

    expect(() => renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Switch to Lab" })).toThrow();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Focus Rack A host" }).props.onPress();
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Switch to Lab" })).toBeDefined();

    await act(async () => {
      renderer.unmount();
    });
  });
});

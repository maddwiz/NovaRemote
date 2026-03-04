import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerProfile, SharedServerTemplate, TerminalBackendKind } from "../types";
import { ServersScreen } from "./ServersScreen";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
}));

vi.mock("../hooks/useQrSetup", () => ({
  useQrSetup: () => ({
    parseQrPayload: () => ({
      ok: false,
      error: "Unsupported QR payload",
    }),
  }),
}));

vi.mock("../hooks/useSharedWorkspaces", () => ({
  useSharedWorkspaces: () => ({
    workspaces: [],
    loading: false,
    createWorkspace: () => null,
    deleteWorkspace: () => {},
    setWorkspaceServers: () => {},
    setMemberRole: () => {},
  }),
}));

vi.mock("../hooks/useVoiceChannels", () => ({
  useVoiceChannels: () => ({
    channels: [],
    loading: false,
    createChannel: () => null,
    deleteChannel: () => {},
    pruneWorkspaceChannels: () => {},
    joinChannel: () => {},
    leaveChannel: () => {},
    toggleMute: () => {},
  }),
}));

vi.mock("../components/QrScannerModal", () => ({
  QrScannerModal: () => null,
}));

function makeServer(id: string, name: string, overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id,
    name,
    baseUrl: `https://${id}.novaremote.test`,
    token: `${id}-token`,
    defaultCwd: "/workspace",
    terminalBackend: "auto",
    ...overrides,
  };
}

function makeBaseProps(servers: ServerProfile[]): React.ComponentProps<typeof ServersScreen> {
  const noop = () => {};
  const noopImport = (_config: {
    name?: string;
    url?: string;
    token?: string;
    cwd?: string;
    backend?: string;
    vmHost?: string;
    vmType?: string;
    vmName?: string;
    vmId?: string;
    sshHost?: string;
    sshUser?: string;
    sshPort?: string | number;
    portainerUrl?: string;
    proxmoxUrl?: string;
    grafanaUrl?: string;
  }) => {};
  const noopApplyTemplate = (_template: SharedServerTemplate) => {};
  const noopBackend = (_value: TerminalBackendKind) => {};

  return {
    servers,
    activeServerId: null,
    serverNameInput: "",
    serverUrlInput: "",
    serverTokenInput: "",
    serverCwdInput: "",
    serverBackendInput: "auto",
    serverSshHostInput: "",
    serverSshUserInput: "",
    serverSshPortInput: "22",
    serverVmHostInput: "",
    serverVmTypeInput: "",
    serverVmNameInput: "",
    serverVmIdInput: "",
    serverPortainerUrlInput: "",
    serverProxmoxUrlInput: "",
    serverGrafanaUrlInput: "",
    editingServerId: null,
    tokenMasked: true,
    isPro: true,
    analyticsEnabled: true,
    analyticsAnonId: "anon-test",
    myReferralCode: "",
    claimedReferralCode: "",
    referralCodeInput: "",
    growthStatus: "",
    sharedTemplatesPayload: "",
    sharedTemplatesStatus: "",
    sharedTemplates: [],
    requireBiometric: false,
    requireDangerConfirm: false,
    onUseServer: noop,
    onBeginEditServer: noop,
    onDeleteServer: noop,
    onShareServer: noop,
    onOpenServerSsh: noop,
    onImportServerConfig: noopImport,
    onSetServerName: noop,
    onSetServerUrl: noop,
    onSetServerToken: noop,
    onSetServerCwd: noop,
    onSetServerBackend: noopBackend,
    onSetServerSshHost: noop,
    onSetServerSshUser: noop,
    onSetServerSshPort: noop,
    onSetServerVmHost: noop,
    onSetServerVmType: noop,
    onSetServerVmName: noop,
    onSetServerVmId: noop,
    onSetServerPortainerUrl: noop,
    onSetServerProxmoxUrl: noop,
    onSetServerGrafanaUrl: noop,
    onSetAnalyticsEnabled: noop,
    onShareReferral: noop,
    onSetReferralCodeInput: noop,
    onClaimReferralCode: noop,
    onSetSharedTemplatesPayload: noop,
    onExportSharedTemplates: noop,
    onImportSharedTemplates: noop,
    onApplySharedTemplate: noopApplyTemplate,
    onDeleteSharedTemplate: noop,
    onShowPaywall: noop,
    onSetRequireBiometric: noop,
    onSetRequireDangerConfirm: noop,
    onToggleTokenMask: noop,
    onClearForm: noop,
    onSaveServer: noop,
    onBackToTerminals: noop,
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

describe("ServersScreen VM host hierarchy", () => {
  async function renderScreen(props: React.ComponentProps<typeof ServersScreen>) {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(ServersScreen, props));
    });
    await act(async () => {
      await Promise.resolve();
    });
    return renderer!;
  }

  it("toggles a single host group collapsed and expanded", async () => {
    const servers = [
      makeServer("dgx", "DGX", { vmHost: "Rack A", vmType: "proxmox" }),
      makeServer("lab", "Lab", { vmHost: "Rack A", vmType: "qemu" }),
      makeServer("cloud", "Cloud"),
    ];

    const renderer = await renderScreen(makeBaseProps(servers));

    expect(renderer.root.findByProps({ accessibilityLabel: "Use server DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Use server Lab" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Toggle Rack A host group" }).props.onPress();
    });

    expect(() => renderer.root.findByProps({ accessibilityLabel: "Use server DGX" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Use server Lab" })).toThrow();
    expect(renderer.root.findByProps({ accessibilityLabel: "Use server Cloud" })).toBeDefined();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Toggle Rack A host group" }).props.onPress();
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Use server DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Use server Lab" })).toBeDefined();

    await act(async () => {
      renderer.unmount();
    });
  });

  it("collapses and expands all host groups from toolbar controls", async () => {
    const servers = [
      makeServer("dgx", "DGX", { vmHost: "Rack A", vmType: "proxmox" }),
      makeServer("lab", "Lab", { vmHost: "Rack A", vmType: "qemu" }),
      makeServer("edge", "Edge", { vmHost: "Rack B", vmType: "docker" }),
    ];

    const renderer = await renderScreen(makeBaseProps(servers));

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Collapse all server host groups" }).props.onPress();
    });

    expect(() => renderer.root.findByProps({ accessibilityLabel: "Use server DGX" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Use server Lab" })).toThrow();
    expect(() => renderer.root.findByProps({ accessibilityLabel: "Use server Edge" })).toThrow();

    act(() => {
      renderer.root.findByProps({ accessibilityLabel: "Expand all server host groups" }).props.onPress();
    });

    expect(renderer.root.findByProps({ accessibilityLabel: "Use server DGX" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Use server Lab" })).toBeDefined();
    expect(renderer.root.findByProps({ accessibilityLabel: "Use server Edge" })).toBeDefined();

    await act(async () => {
      renderer.unmount();
    });
  });
});

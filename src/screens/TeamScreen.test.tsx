import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamScreen } from "./TeamScreen";
import { TeamIdentity } from "../types";

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

describe("TeamScreen", () => {
  const identity: TeamIdentity = {
    provider: "novaremote_cloud" as const,
    userId: "user-1",
    email: "dev@example.com",
    displayName: "Dev",
    teamId: "team-1",
    teamName: "Ops",
    role: "admin" as const,
    permissions: ["team:manage", "team:invite"],
    accessToken: "token",
    tokenExpiresAt: Date.now() + 1000,
    refreshToken: "refresh",
  };

  it("submits login payload from team login form", async () => {
    const onLogin = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={null}
          members={[]}
          loading={false}
          busy={false}
          onLogin={onLogin}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Team login email" }).props.onChangeText("dev@example.com");
      renderer?.root.findByProps({ accessibilityLabel: "Team login password" }).props.onChangeText("secret");
      renderer?.root.findByProps({ accessibilityLabel: "Team invite code" }).props.onChangeText("INVITE-123");
    });
    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Sign in to team account" }).props.onPress();
    });

    expect(onLogin).toHaveBeenCalledWith({
      email: "dev@example.com",
      password: "secret",
      inviteCode: "INVITE-123",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("submits SSO login payload when SSO mode is selected", async () => {
    const onLoginSso = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={null}
          members={[]}
          loading={false}
          busy={false}
          onLoginSso={onLoginSso}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Use SSO login" }).props.onPress();
    });
    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Set SSO provider saml" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Team SSO token" }).props.onChangeText("sso-token-1");
      renderer?.root.findByProps({ accessibilityLabel: "Team invite code" }).props.onChangeText("TEAM-INVITE");
    });
    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Sign in to team account" }).props.onPress();
    });

    expect(onLoginSso).toHaveBeenCalledWith({
      provider: "saml",
      idToken: "sso-token-1",
      inviteCode: "TEAM-INVITE",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("renders team details and routes sign-out", async () => {
    const onLogout = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[
            {
              id: "member-1",
              name: "Alice",
              email: "alice@example.com",
              role: "operator",
            },
          ]}
          settings={{
            enforceDangerConfirm: true,
            commandBlocklist: ["rm -rf"],
            sessionTimeoutMinutes: 15,
            requireSessionRecording: null,
            requireFleetApproval: null,
          }}
          planTier="team"
          loading={false}
          busy={false}
          onLogout={onLogout}
        />
      );
    });

    expect(() => renderer?.root.findByProps({ children: "Plan: team" })).not.toThrow();

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Sign out from team account" }).props.onPress();
    });
    expect(onLogout).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes team policy updates when settings management is enabled", async () => {
    const onUpdateSettings = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          settings={{
            enforceDangerConfirm: null,
            commandBlocklist: [],
            sessionTimeoutMinutes: null,
            requireSessionRecording: null,
            requireFleetApproval: null,
          }}
          loading={false}
          busy={false}
          canManageSettings
          onUpdateSettings={onUpdateSettings}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Set danger confirmation policy on" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Set fleet approval policy on" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Set session recording policy off" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Team session timeout minutes" }).props.onChangeText("45");
      renderer?.root
        .findByProps({ accessibilityLabel: "Team command blocklist patterns" })
        .props.onChangeText("rm -rf\nshutdown -h now");
    });
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Save team policies" }).props.onPress();
    });

    expect(onUpdateSettings).toHaveBeenCalledWith({
      enforceDangerConfirm: true,
      requireFleetApproval: true,
      requireSessionRecording: false,
      sessionTimeoutMinutes: 45,
      commandBlocklist: ["rm -rf", "shutdown -h now"],
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("submits invite payload with selected role", async () => {
    const onInviteMember = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          loading={false}
          busy={false}
          canInvite
          onInviteMember={onInviteMember}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Team invite email" }).props.onChangeText("ALICE@EXAMPLE.COM");
      renderer?.root.findByProps({ accessibilityLabel: "Invite role operator" }).props.onPress();
    });
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Send team invite" }).props.onPress();
    });

    expect(onInviteMember).toHaveBeenCalledWith({
      email: "alice@example.com",
      role: "operator",
    });

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes member role changes when management is enabled", async () => {
    const onChangeMemberRole = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[
            {
              id: "member-1",
              name: "Alice",
              email: "alice@example.com",
              role: "viewer",
            },
          ]}
          loading={false}
          busy={false}
          canManage
          onChangeMemberRole={onChangeMemberRole}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Set alice@example.com to operator" }).props.onPress();
    });

    expect(onChangeMemberRole).toHaveBeenCalledWith("member-1", "operator");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("renders per-member usage metrics when available", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[
            {
              id: "member-1",
              name: "Alice",
              email: "alice@example.com",
              role: "viewer",
              sessionsCreated: 4,
              commandsSent: 20,
              fleetExecutions: 1,
            },
          ]}
          loading={false}
          busy={false}
        />
      );
    });

    expect(() => renderer?.root.findByProps({ children: "Usage: sessions 4 • commands 20 • fleet 1" })).not.toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes member server-assignment changes when management is enabled", async () => {
    const onSetMemberServers = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[
            {
              id: "member-1",
              name: "Alice",
              email: "alice@example.com",
              role: "viewer",
              serverIds: ["dgx"],
            },
          ]}
          teamServers={[
            { id: "dgx", name: "DGX", baseUrl: "https://dgx", token: "x", defaultCwd: "/" },
            { id: "home", name: "Home", baseUrl: "https://home", token: "y", defaultCwd: "/" },
          ]}
          loading={false}
          busy={false}
          canManage
          onSetMemberServers={onSetMemberServers}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Toggle alice@example.com access to Home" }).props.onPress();
    });
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Save server access for alice@example.com" }).props.onPress();
    });

    expect(onSetMemberServers).toHaveBeenCalledWith("member-1", ["dgx", "home"]);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("triggers audit sync and exports when requested", async () => {
    const onSyncAudit = vi.fn(async () => undefined);
    const onExportAuditJson = vi.fn(async () => undefined);
    const onExportAuditCsv = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          settings={{
            enforceDangerConfirm: true,
            commandBlocklist: [],
            sessionTimeoutMinutes: null,
            requireSessionRecording: null,
            requireFleetApproval: null,
          }}
          loading={false}
          busy={false}
          onSyncAudit={onSyncAudit}
          onExportAuditJson={onExportAuditJson}
          onExportAuditCsv={onExportAuditCsv}
        />
      );
    });

    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Sync audit log" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Export audit log as JSON" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Export audit log as CSV" }).props.onPress();
    });

    expect(onSyncAudit).toHaveBeenCalledTimes(1);
    expect(onExportAuditJson).toHaveBeenCalledTimes(1);
    expect(onExportAuditCsv).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("requests and opens cloud audit exports when configured", async () => {
    const onRequestCloudAuditExportJson = vi.fn(async () => undefined);
    const onRequestCloudAuditExportCsv = vi.fn(async () => undefined);
    const onRefreshCloudAuditExports = vi.fn(async () => undefined);
    const onOpenCloudAuditExport = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          loading={false}
          busy={false}
          cloudAuditExportJob={{
            exportId: "exp-1",
            format: "json",
            status: "ready",
            createdAt: "2026-03-05T00:00:00.000Z",
            downloadUrl: "https://cloud.novaremote.dev/exports/exp-1.json",
          }}
          cloudAuditExports={[
            {
              exportId: "exp-2",
              format: "csv",
              status: "ready",
              createdAt: "2026-03-05T01:00:00.000Z",
              downloadUrl: "https://cloud.novaremote.dev/exports/exp-2.csv",
            },
          ]}
          onRequestCloudAuditExportJson={onRequestCloudAuditExportJson}
          onRequestCloudAuditExportCsv={onRequestCloudAuditExportCsv}
          onRefreshCloudAuditExports={onRefreshCloudAuditExports}
          onOpenCloudAuditExport={onOpenCloudAuditExport}
        />
      );
    });

    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Request cloud audit export as JSON" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Request cloud audit export as CSV" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Refresh cloud audit exports" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Open latest cloud audit export" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Open cloud audit export exp-2" }).props.onPress();
    });

    expect(onRequestCloudAuditExportJson).toHaveBeenCalledTimes(1);
    expect(onRequestCloudAuditExportCsv).toHaveBeenCalledTimes(1);
    expect(onRefreshCloudAuditExports).toHaveBeenCalledTimes(1);
    expect(onOpenCloudAuditExport).toHaveBeenCalledTimes(2);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("filters team members by query and role", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[
            { id: "member-1", name: "Alice", email: "alice@example.com", role: "operator" },
            { id: "member-2", name: "Bob", email: "bob@example.com", role: "viewer" },
          ]}
          loading={false}
          busy={false}
          canManage
          onChangeMemberRole={async () => undefined}
        />
      );
    });

    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set alice@example.com to operator" })).not.toThrow();
    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set bob@example.com to viewer" })).not.toThrow();

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Filter team members by query" }).props.onChangeText("alice");
    });

    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set alice@example.com to operator" })).not.toThrow();
    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set bob@example.com to viewer" })).toThrow();

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Filter team members by query" }).props.onChangeText("");
      renderer?.root.findByProps({ accessibilityLabel: "Filter members by viewer" }).props.onPress();
    });

    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set bob@example.com to viewer" })).not.toThrow();
    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Set alice@example.com to operator" })).toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes fleet approval review actions for team managers", async () => {
    const onApproveFleetApproval = vi.fn(async () => undefined);
    const onDenyFleetApproval = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          fleetApprovals={[
            {
              id: "approval-1",
              command: "docker compose up -d",
              requestedByUserId: "user-2",
              requestedByEmail: "ops@example.com",
              targets: ["dgx", "home"],
              createdAt: "2026-03-05T00:00:00.000Z",
              updatedAt: "2026-03-05T00:00:00.000Z",
              status: "pending",
            },
          ]}
          loading={false}
          busy={false}
          canManage
          onApproveFleetApproval={onApproveFleetApproval}
          onDenyFleetApproval={onDenyFleetApproval}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Fleet approval note approval-1" }).props.onChangeText("Looks safe");
    });
    await act(async () => {
      await Promise.resolve();
    });
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Approve fleet request approval-1" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Deny fleet request approval-1" }).props.onPress();
    });

    expect(onApproveFleetApproval).toHaveBeenCalledWith("approval-1", "Looks safe");
    expect(onDenyFleetApproval).toHaveBeenCalledWith("approval-1", "Looks safe");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("disables self-approval for fleet requests created by the signed-in user", async () => {
    const onApproveFleetApproval = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          fleetApprovals={[
            {
              id: "approval-self",
              command: "docker compose up -d",
              requestedByUserId: "user-1",
              requestedByEmail: "dev@example.com",
              targets: ["dgx"],
              createdAt: "2026-03-05T00:00:00.000Z",
              updatedAt: "2026-03-05T00:00:00.000Z",
              status: "pending",
            },
          ]}
          loading={false}
          busy={false}
          canManage
          onApproveFleetApproval={onApproveFleetApproval}
        />
      );
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }
    const mountedRoot = (renderer as unknown as TestRenderer.ReactTestRenderer).root;
    const approveButton = mountedRoot.findByProps({ accessibilityLabel: "Approve fleet request approval-self" });
    expect(approveButton.props.disabled).toBe(true);
    expect(() =>
      mountedRoot.findByProps({ children: "Self-approval is blocked. Another team member must approve." })
    ).not.toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("renders team invites and routes revoke action", async () => {
    const onRevokeInvite = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          teamInvites={[
            {
              id: "invite-1",
              email: "new-user@example.com",
              role: "viewer",
              status: "pending",
              inviteCode: "INV-ABC123",
              createdAt: "2026-03-05T00:00:00.000Z",
              expiresAt: "2026-03-10T00:00:00.000Z",
            },
          ]}
          loading={false}
          busy={false}
          canInvite
          onRevokeInvite={onRevokeInvite}
        />
      );
    });

    expect(() => renderer?.root.findByProps({ children: "Team Invites (1 pending)" })).not.toThrow();
    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Revoke invite invite-1" }).props.onPress();
    });
    expect(onRevokeInvite).toHaveBeenCalledWith("invite-1");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes cloud dashboard open action when configured", async () => {
    const onOpenCloudDashboard = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          cloudDashboardUrl="https://cloud.novaremote.dev"
          onOpenCloudDashboard={onOpenCloudDashboard}
          loading={false}
          busy={false}
        />
      );
    });

    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Open cloud dashboard" }).props.onPress();
    });
    expect(onOpenCloudDashboard).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("routes SSO provider enable and disable actions when management is enabled", async () => {
    const onUpdateSsoProvider = vi.fn(async () => undefined);
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <TeamScreen
          identity={identity}
          members={[]}
          loading={false}
          busy={false}
          canManage
          teamSsoProviders={[
            { provider: "oidc", enabled: false },
            { provider: "saml", enabled: true, issuerUrl: "https://idp.example.com/saml" },
          ]}
          onUpdateSsoProvider={onUpdateSsoProvider}
        />
      );
    });

    await act(async () => {
      renderer?.root.findByProps({ accessibilityLabel: "Enable oidc provider" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Disable saml provider" }).props.onPress();
    });

    expect(onUpdateSsoProvider).toHaveBeenNthCalledWith(1, { provider: "oidc", enabled: true });
    expect(onUpdateSsoProvider).toHaveBeenNthCalledWith(2, { provider: "saml", enabled: false });

    await act(async () => {
      renderer?.unmount();
    });
  });
});

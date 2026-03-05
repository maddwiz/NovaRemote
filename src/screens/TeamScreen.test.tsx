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
});

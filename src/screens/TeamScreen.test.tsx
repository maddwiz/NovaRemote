import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { TeamScreen } from "./TeamScreen";

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
          identity={{
            provider: "novaremote_cloud",
            userId: "user-1",
            email: "dev@example.com",
            displayName: "Dev",
            teamId: "team-1",
            teamName: "Ops",
            role: "admin",
            permissions: ["team:manage"],
            accessToken: "token",
            tokenExpiresAt: Date.now() + 1000,
            refreshToken: "refresh",
          }}
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
          }}
          loading={false}
          busy={false}
          onLogout={onLogout}
        />
      );
    });

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Sign out from team account" }).props.onPress();
    });
    expect(onLogout).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

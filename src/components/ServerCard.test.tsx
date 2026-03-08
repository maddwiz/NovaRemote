import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ServerCard } from "./ServerCard";
import { ServerProfile } from "../types";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

function buildServer(overrides: Partial<ServerProfile> = {}): ServerProfile {
  return {
    id: "server-1",
    name: "DGX",
    baseUrl: "https://dgx.novaremote.dev",
    token: "token-1",
    defaultCwd: "/workspace",
    terminalBackend: "auto",
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
});

afterEach(() => {
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("ServerCard", () => {
  it("allows edit/delete actions for local servers", async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onShare = vi.fn();
    const onOpenSsh = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <ServerCard
          server={buildServer({ id: "local-1", name: "Local" })}
          isActive={false}
          onUse={onUse}
          onEdit={onEdit}
          onDelete={onDelete}
          onShare={onShare}
          onOpenSsh={onOpenSsh}
        />
      );
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }

    const root = (renderer as unknown as TestRenderer.ReactTestRenderer).root;
    act(() => {
      root.findByProps({ accessibilityLabel: "Open more actions for server Local" }).props.onPress();
    });

    const editButton = root.findByProps({ accessibilityLabel: "Edit server Local" });
    const deleteButton = root.findByProps({ accessibilityLabel: "Delete server Local" });
    expect(editButton.props.disabled).toBe(false);
    expect(deleteButton.props.disabled).toBe(false);

    act(() => {
      editButton.props.onPress();
      deleteButton.props.onPress();
    });

    expect(onEdit).toHaveBeenCalledWith(expect.objectContaining({ id: "local-1" }));
    expect(onDelete).toHaveBeenCalledWith("local-1");
    expect(() => root.findByProps({ children: "Managed by team admin" })).toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("locks edit/delete for team-managed servers and surfaces permission badge", async () => {
    const onUse = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onShare = vi.fn();
    const onOpenSsh = vi.fn();
    let renderer: TestRenderer.ReactTestRenderer | null = null;

    await act(async () => {
      renderer = TestRenderer.create(
        <ServerCard
          server={buildServer({ id: "team-1", name: "Team Host", source: "team", permissionLevel: "viewer" })}
          isActive={false}
          onUse={onUse}
          onEdit={onEdit}
          onDelete={onDelete}
          onShare={onShare}
          onOpenSsh={onOpenSsh}
        />
      );
    });

    if (!renderer) {
      throw new Error("Renderer did not initialize.");
    }

    const root = (renderer as unknown as TestRenderer.ReactTestRenderer).root;
    act(() => {
      root.findByProps({ accessibilityLabel: "Open more actions for server Team Host" }).props.onPress();
    });

    const editButton = root.findByProps({ accessibilityLabel: "Edit server Team Host" });
    const deleteButton = root.findByProps({ accessibilityLabel: "Delete server Team Host" });
    expect(editButton.props.disabled).toBe(true);
    expect(deleteButton.props.disabled).toBe(true);
    expect(() => root.findByProps({ children: "TEAM VIEWER" })).not.toThrow();
    expect(() => root.findByProps({ children: "Managed by team admin" })).not.toThrow();
    expect(root.findAllByProps({ children: "Managed" }).length).toBeGreaterThanOrEqual(2);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

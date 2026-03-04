import { describe, expect, it } from "vitest";

import { SharedWorkspace } from "./types";
import {
  getWorkspaceLocalMember,
  getWorkspaceLocalRole,
  getWorkspacePermissions,
  workspacePermissionsForRole,
} from "./workspacePermissions";

function makeWorkspace(overrides: Partial<SharedWorkspace> = {}): SharedWorkspace {
  return {
    id: "workspace-1",
    name: "Ops",
    serverIds: ["dgx"],
    members: [{ id: "local-user", name: "Local User", role: "owner" }],
    channelId: "channel-workspace-1",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("workspacePermissions helpers", () => {
  it("resolves local member and role with fallback", () => {
    const workspace = makeWorkspace({
      members: [
        { id: "remote-1", name: "Teammate", role: "editor" },
        { id: "remote-2", name: "Observer", role: "viewer" },
      ],
    });

    expect(getWorkspaceLocalMember(workspace)?.id).toBe("remote-1");
    expect(getWorkspaceLocalRole(workspace)).toBe("editor");
  });

  it("maps roles to expected permissions", () => {
    expect(workspacePermissionsForRole("owner")).toMatchObject({
      canManageWorkspace: true,
      canManageMembers: true,
      canDeleteWorkspace: true,
      canManageChannels: true,
      canUseFleetTargets: true,
      canJoinChannels: true,
    });

    expect(workspacePermissionsForRole("editor")).toMatchObject({
      canManageWorkspace: true,
      canManageMembers: false,
      canDeleteWorkspace: false,
      canManageChannels: true,
      canUseFleetTargets: true,
      canJoinChannels: true,
    });

    expect(workspacePermissionsForRole("viewer")).toMatchObject({
      canManageWorkspace: false,
      canManageMembers: false,
      canDeleteWorkspace: false,
      canManageChannels: false,
      canUseFleetTargets: false,
      canJoinChannels: true,
    });
  });

  it("derives permissions from workspace role", () => {
    const viewerWorkspace = makeWorkspace({
      members: [{ id: "local-user", name: "Local User", role: "viewer" }],
    });

    expect(getWorkspacePermissions(viewerWorkspace).canManageWorkspace).toBe(false);
    expect(getWorkspacePermissions(viewerWorkspace).canJoinChannels).toBe(true);
  });
});


import { SharedWorkspace, WorkspaceMember, WorkspaceRole } from "./types";

export type WorkspacePermissionSet = {
  role: WorkspaceRole;
  canManageWorkspace: boolean;
  canManageMembers: boolean;
  canDeleteWorkspace: boolean;
  canManageChannels: boolean;
  canUseFleetTargets: boolean;
  canJoinChannels: boolean;
};

const VIEWER_PERMISSIONS: WorkspacePermissionSet = {
  role: "viewer",
  canManageWorkspace: false,
  canManageMembers: false,
  canDeleteWorkspace: false,
  canManageChannels: false,
  canUseFleetTargets: false,
  canJoinChannels: true,
};

export function getWorkspaceLocalMember(
  workspace: SharedWorkspace,
  localUserId: string = "local-user"
): WorkspaceMember | null {
  if (!workspace.members || workspace.members.length === 0) {
    return null;
  }
  return workspace.members.find((member) => member.id === localUserId) || workspace.members[0] || null;
}

export function getWorkspaceLocalRole(
  workspace: SharedWorkspace,
  localUserId: string = "local-user"
): WorkspaceRole {
  const member = getWorkspaceLocalMember(workspace, localUserId);
  return member?.role || "viewer";
}

export function workspacePermissionsForRole(role: WorkspaceRole): WorkspacePermissionSet {
  if (role === "owner") {
    return {
      role,
      canManageWorkspace: true,
      canManageMembers: true,
      canDeleteWorkspace: true,
      canManageChannels: true,
      canUseFleetTargets: true,
      canJoinChannels: true,
    };
  }

  if (role === "editor") {
    return {
      role,
      canManageWorkspace: true,
      canManageMembers: false,
      canDeleteWorkspace: false,
      canManageChannels: true,
      canUseFleetTargets: true,
      canJoinChannels: true,
    };
  }

  return VIEWER_PERMISSIONS;
}

export function getWorkspacePermissions(
  workspace: SharedWorkspace,
  localUserId: string = "local-user"
): WorkspacePermissionSet {
  return workspacePermissionsForRole(getWorkspaceLocalRole(workspace, localUserId));
}


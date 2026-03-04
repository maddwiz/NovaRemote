import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { makeId, STORAGE_SHARED_WORKSPACES } from "../constants";
import { SharedWorkspace, WorkspaceMember, WorkspaceRole } from "../types";
import { getWorkspacePermissions } from "../workspacePermissions";

type CreateWorkspaceInput = {
  name: string;
  serverIds: string[];
  members?: WorkspaceMember[];
};

export type UseSharedWorkspacesResult = {
  workspaces: SharedWorkspace[];
  loading: boolean;
  createWorkspace: (input: CreateWorkspaceInput) => SharedWorkspace | null;
  deleteWorkspace: (workspaceId: string) => void;
  renameWorkspace: (workspaceId: string, name: string) => void;
  setWorkspaceServers: (workspaceId: string, serverIds: string[]) => void;
  setMemberRole: (workspaceId: string, memberId: string, role: WorkspaceRole) => void;
};

function uniqueIds(values: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  values.forEach((value) => {
    const id = value.trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    next.push(id);
  });
  return next;
}

function normalizeMember(value: unknown): WorkspaceMember | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<WorkspaceMember>;
  const id = typeof parsed.id === "string" ? parsed.id.trim() : "";
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const role: WorkspaceRole =
    parsed.role === "owner" || parsed.role === "editor" || parsed.role === "viewer" ? parsed.role : "viewer";

  if (!id || !name) {
    return null;
  }

  return { id, name, role };
}

function normalizeWorkspace(value: unknown): SharedWorkspace | null {
  if (!value || typeof value !== "object") {
    return null;
  }
  const parsed = value as Partial<SharedWorkspace>;
  const id = typeof parsed.id === "string" && parsed.id.trim() ? parsed.id.trim() : `workspace-${makeId()}`;
  const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
  const serverIds = uniqueIds(Array.isArray(parsed.serverIds) ? parsed.serverIds : []);
  const members = Array.isArray(parsed.members)
    ? parsed.members.map((member) => normalizeMember(member)).filter((entry): entry is WorkspaceMember => Boolean(entry))
    : [];

  if (!name || members.length === 0) {
    return null;
  }

  return {
    id,
    name,
    serverIds,
    members,
    channelId: typeof parsed.channelId === "string" && parsed.channelId ? parsed.channelId : `channel-${id}`,
    createdAt: typeof parsed.createdAt === "string" && parsed.createdAt ? parsed.createdAt : new Date().toISOString(),
    updatedAt: typeof parsed.updatedAt === "string" && parsed.updatedAt ? parsed.updatedAt : new Date().toISOString(),
  };
}

function sortWorkspaces(workspaces: SharedWorkspace[]): SharedWorkspace[] {
  return workspaces.slice().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function normalizeWorkspaceName(name: string): string {
  return name.trim().replace(/\s+/g, " ");
}

function normalizeMembers(members: WorkspaceMember[] | undefined): WorkspaceMember[] {
  const source = (members || []).map((member) => normalizeMember(member)).filter((entry): entry is WorkspaceMember => Boolean(entry));
  if (source.length === 0) {
    return [{ id: "local-user", name: "Local User", role: "owner" }];
  }

  const byId = new Map<string, WorkspaceMember>();
  source.forEach((member) => {
    byId.set(member.id, member);
  });

  const next = Array.from(byId.values());
  if (!next.some((member) => member.role === "owner")) {
    next[0] = { ...next[0], role: "owner" };
  }
  return next;
}

export function useSharedWorkspaces(): UseSharedWorkspacesResult {
  const [loading, setLoading] = useState<boolean>(true);
  const [workspaces, setWorkspaces] = useState<SharedWorkspace[]>([]);

  useEffect(() => {
    let cancelled = false;
    void SecureStore.getItemAsync(STORAGE_SHARED_WORKSPACES)
      .then((raw) => {
        if (cancelled) {
          return;
        }
        if (!raw) {
          setWorkspaces([]);
          return;
        }
        try {
          const parsed = JSON.parse(raw) as unknown;
          const normalized = Array.isArray(parsed)
            ? sortWorkspaces(parsed.map((entry) => normalizeWorkspace(entry)).filter((entry): entry is SharedWorkspace => Boolean(entry)))
            : [];
          setWorkspaces(normalized);
        } catch {
          setWorkspaces([]);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (loading) {
      return;
    }
    void SecureStore.setItemAsync(STORAGE_SHARED_WORKSPACES, JSON.stringify(workspaces)).catch(() => {});
  }, [loading, workspaces]);

  const createWorkspace = useCallback((input: CreateWorkspaceInput): SharedWorkspace | null => {
    const name = normalizeWorkspaceName(input.name);
    if (!name) {
      return null;
    }
    const serverIds = uniqueIds(input.serverIds);
    const members = normalizeMembers(input.members);
    const now = new Date().toISOString();
    const id = `workspace-${makeId()}`;

    const workspace: SharedWorkspace = {
      id,
      name,
      serverIds,
      members,
      channelId: `channel-${id}`,
      createdAt: now,
      updatedAt: now,
    };

    setWorkspaces((prev) => sortWorkspaces([workspace, ...prev]));
    return workspace;
  }, []);

  const deleteWorkspace = useCallback((workspaceId: string) => {
    setWorkspaces((prev) => {
      let changed = false;
      const next = prev.filter((workspace) => {
        if (workspace.id !== workspaceId) {
          return true;
        }
        if (!getWorkspacePermissions(workspace).canDeleteWorkspace) {
          return true;
        }
        changed = true;
        return false;
      });
      return changed ? next : prev;
    });
  }, []);

  const renameWorkspace = useCallback((workspaceId: string, name: string) => {
    const nextName = normalizeWorkspaceName(name);
    if (!nextName) {
      return;
    }

    setWorkspaces((prev) =>
      sortWorkspaces(
        prev.map((workspace) =>
          workspace.id === workspaceId && getWorkspacePermissions(workspace).canManageWorkspace
            ? {
                ...workspace,
                name: nextName,
                updatedAt: new Date().toISOString(),
              }
            : workspace
        )
      )
    );
  }, []);

  const setWorkspaceServers = useCallback((workspaceId: string, serverIds: string[]) => {
    const nextServerIds = uniqueIds(serverIds);
    setWorkspaces((prev) =>
      sortWorkspaces(
        prev.map((workspace) =>
          workspace.id === workspaceId && getWorkspacePermissions(workspace).canManageWorkspace
            ? {
                ...workspace,
                serverIds: nextServerIds,
                updatedAt: new Date().toISOString(),
              }
            : workspace
        )
      )
    );
  }, []);

  const setMemberRole = useCallback((workspaceId: string, memberId: string, role: WorkspaceRole) => {
    setWorkspaces((prev) =>
      sortWorkspaces(
        prev.map((workspace) => {
          if (workspace.id !== workspaceId) {
            return workspace;
          }
          if (!getWorkspacePermissions(workspace).canManageMembers) {
            return workspace;
          }
          const members = workspace.members.map((member) => (member.id === memberId ? { ...member, role } : member));
          if (!members.some((member) => member.role === "owner") && members[0]) {
            members[0] = { ...members[0], role: "owner" };
          }
          return {
            ...workspace,
            members,
            updatedAt: new Date().toISOString(),
          };
        })
      )
    );
  }, []);

  return useMemo(
    () => ({
      workspaces,
      loading,
      createWorkspace,
      deleteWorkspace,
      renameWorkspace,
      setWorkspaceServers,
      setMemberRole,
    }),
    [createWorkspace, deleteWorkspace, loading, renameWorkspace, setMemberRole, setWorkspaceServers, workspaces]
  );
}

export const sharedWorkspacesTestUtils = {
  uniqueIds,
  normalizeMembers,
  normalizeWorkspace,
};

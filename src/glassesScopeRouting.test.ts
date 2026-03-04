import { describe, expect, it } from "vitest";

import { resolveGlassesScopeRoute } from "./glassesScopeRouting";

const WORKSPACES = [
  { id: "workspace-platform", name: "Platform Ops" },
  { id: "workspace-cloud", name: "Cloud Build" },
];

const VM_HOST_SCOPE_OPTIONS = [
  { key: "rack a", label: "Rack A" },
  { key: "rack b", label: "Rack B" },
  { key: "__none__", label: "Standalone" },
];

describe("resolveGlassesScopeRoute", () => {
  it("resolves explicit workspace scope commands", () => {
    expect(
      resolveGlassesScopeRoute({
        transcript: "scope workspace to Platform Ops",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_workspace_scope", workspaceId: "workspace-platform" });

    expect(
      resolveGlassesScopeRoute({
        transcript: "show workspace cloud",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_workspace_scope", workspaceId: "workspace-cloud" });
  });

  it("resolves clear workspace scope commands", () => {
    expect(
      resolveGlassesScopeRoute({
        transcript: "show workspace all servers",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_workspace_scope", workspaceId: null });

    expect(
      resolveGlassesScopeRoute({
        transcript: "filter workspace all workspaces",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_workspace_scope", workspaceId: null });
  });

  it("resolves explicit vm host scope commands", () => {
    expect(
      resolveGlassesScopeRoute({
        transcript: "scope host rack b",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_vm_host_scope", vmHostScope: "rack b" });

    expect(
      resolveGlassesScopeRoute({
        transcript: "show vm host standalone",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_vm_host_scope", vmHostScope: "__none__" });
  });

  it("resolves clear vm host scope commands", () => {
    expect(
      resolveGlassesScopeRoute({
        transcript: "filter host all hosts",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "set_vm_host_scope", vmHostScope: null });
  });

  it("returns none when target cannot be resolved", () => {
    expect(
      resolveGlassesScopeRoute({
        transcript: "scope workspace that-does-not-exist",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "none" });

    expect(
      resolveGlassesScopeRoute({
        transcript: "scope host unknown-rack",
        workspaces: WORKSPACES,
        vmHostScopeOptions: VM_HOST_SCOPE_OPTIONS,
      })
    ).toEqual({ kind: "none" });
  });
});


type ScopeWorkspace = {
  id: string;
  name: string;
};

type VmHostScopeOption = {
  key: string;
  label: string;
};

export type GlassesScopeRoute =
  | { kind: "none" }
  | { kind: "set_workspace_scope"; workspaceId: string | null }
  | { kind: "set_vm_host_scope"; vmHostScope: string | null };

type ResolveGlassesScopeRouteArgs = {
  transcript: string;
  workspaces: ScopeWorkspace[];
  vmHostScopeOptions: VmHostScopeOption[];
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value: string): string[] {
  return normalize(value)
    .split(" ")
    .map((part) => part.trim())
    .filter(Boolean);
}

function scoreNameMatch(name: string, targetTokens: string[]): number {
  if (targetTokens.length === 0) {
    return 0;
  }
  const normalizedName = normalize(name);
  let score = 0;
  let matchedTokens = 0;
  targetTokens.forEach((token) => {
    if (!token) {
      return;
    }
    if (normalizedName === token) {
      score += 3;
      matchedTokens += 1;
      return;
    }
    if (normalizedName.includes(token)) {
      score += 1;
      matchedTokens += 1;
    }
  });
  if (matchedTokens !== targetTokens.length) {
    return 0;
  }
  return score;
}

function resolveWorkspaceId(target: string, workspaces: ScopeWorkspace[]): string | null {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) {
    return null;
  }

  if (
    normalizedTarget === "all" ||
    normalizedTarget === "all servers" ||
    normalizedTarget === "all server" ||
    normalizedTarget === "all workspaces" ||
    normalizedTarget === "every workspace" ||
    normalizedTarget === "any workspace"
  ) {
    return null;
  }

  const exact = workspaces.find((workspace) => normalize(workspace.name) === normalizedTarget);
  if (exact) {
    return exact.id;
  }

  const tokens = tokenize(normalizedTarget);
  const best = workspaces.reduce(
    (candidate, workspace) => {
      const score = scoreNameMatch(workspace.name, tokens);
      if (score > candidate.score) {
        return { item: workspace, score };
      }
      return candidate;
    },
    { item: null as ScopeWorkspace | null, score: 0 }
  );
  if (best.score > 0 && best.item) {
    return best.item.id;
  }
  return null;
}

function resolveVmHostScope(target: string, vmHostScopeOptions: VmHostScopeOption[]): string | null {
  const normalizedTarget = normalize(target);
  if (!normalizedTarget) {
    return null;
  }

  if (
    normalizedTarget === "all" ||
    normalizedTarget === "all hosts" ||
    normalizedTarget === "all host" ||
    normalizedTarget === "all vm hosts" ||
    normalizedTarget === "every host" ||
    normalizedTarget === "any host" ||
    normalizedTarget === "any vm host"
  ) {
    return null;
  }

  const standaloneOption = vmHostScopeOptions.find((option) => option.key === "__none__");
  if (
    standaloneOption &&
    (normalizedTarget === "standalone" ||
      normalizedTarget === "no host" ||
      normalizedTarget === "none" ||
      normalizedTarget === "local")
  ) {
    return "__none__";
  }

  const exact = vmHostScopeOptions.find((option) => normalize(option.label) === normalizedTarget);
  if (exact) {
    return exact.key;
  }

  const tokens = tokenize(normalizedTarget);
  const best = vmHostScopeOptions.reduce(
    (candidate, option) => {
      const score = scoreNameMatch(option.label, tokens);
      if (score > candidate.score) {
        return { item: option, score };
      }
      return candidate;
    },
    { item: null as VmHostScopeOption | null, score: 0 }
  );
  if (best.score > 0 && best.item) {
    return best.item.key;
  }
  return null;
}

export function resolveGlassesScopeRoute({
  transcript,
  workspaces,
  vmHostScopeOptions,
}: ResolveGlassesScopeRouteArgs): GlassesScopeRoute {
  const cleaned = transcript.trim();
  if (!cleaned) {
    return { kind: "none" };
  }

  const workspaceMatch = cleaned.match(
    /^(?:scope|filter|show)\s+workspace(?:s)?(?:\s+(?:to|as|for))?\s+(.+)$/i
  );
  if (workspaceMatch) {
    const target = workspaceMatch[1]?.trim() || "";
    const workspaceId = resolveWorkspaceId(target, workspaces);
    if (!workspaceId && normalize(target) && !normalize(target).startsWith("all")) {
      return { kind: "none" };
    }
    return { kind: "set_workspace_scope", workspaceId };
  }

  const hostMatch = cleaned.match(
    /^(?:scope|filter|show)\s+(?:vm\s+)?hosts?(?:\s+(?:to|as|for))?\s+(.+)$/i
  );
  if (hostMatch) {
    const target = hostMatch[1]?.trim() || "";
    const vmHostScope = resolveVmHostScope(target, vmHostScopeOptions);
    if (!vmHostScope && normalize(target) && !normalize(target).startsWith("all")) {
      return { kind: "none" };
    }
    return { kind: "set_vm_host_scope", vmHostScope };
  }

  return { kind: "none" };
}

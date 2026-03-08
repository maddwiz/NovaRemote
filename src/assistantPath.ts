export type ResolvedAssistantFolderTarget = {
  commandPath: string;
  displayPath: string;
  parentPath: string | null;
  shellExpandable: boolean;
};

function trimWrappingQuotes(value: string): string {
  return value.replace(/^["']+|["']+$/g, "");
}

function normalizeHumanPathPrefix(value: string): string {
  return value
    .replace(/^(?:on|in)\s+(?:my|the)\s+/i, "")
    .replace(/^(?:my|the)\s+/i, "");
}

export function inferPosixHomeDirectory(path: string): string | null {
  const normalized = path.trim().replace(/\/+$/, "");
  if (!normalized) {
    return null;
  }

  const macMatch = normalized.match(/^(\/Users\/[^/]+)(?:\/|$)/);
  if (macMatch?.[1]) {
    return macMatch[1];
  }

  const linuxMatch = normalized.match(/^(\/home\/[^/]+)(?:\/|$)/);
  if (linuxMatch?.[1]) {
    return linuxMatch[1];
  }

  return null;
}

function buildResolvedTarget(
  commandPath: string,
  displayPath: string,
  shellExpandable: boolean
): ResolvedAssistantFolderTarget {
  const parentPath = shellExpandable ? null : commandPath.replace(/\/+$/, "").replace(/\/[^/]+$/, "") || "/";
  return {
    commandPath,
    displayPath,
    parentPath,
    shellExpandable,
  };
}

export function resolveAssistantFolderTarget(requestedPath: string, baseDirectory: string): ResolvedAssistantFolderTarget {
  const cleaned = normalizeHumanPathPrefix(trimWrappingQuotes(requestedPath.trim()));
  const normalizedBaseDirectory = baseDirectory.trim().replace(/\/+$/, "");
  const inferredHome = inferPosixHomeDirectory(normalizedBaseDirectory);

  if (!cleaned) {
    return buildResolvedTarget(normalizedBaseDirectory || "/", normalizedBaseDirectory || "/", false);
  }

  if (cleaned.startsWith("/")) {
    return buildResolvedTarget(cleaned, cleaned, false);
  }

  const tildeMatch = cleaned.match(/^~\/?(.*)$/);
  if (tildeMatch) {
    const suffix = (tildeMatch[1] || "").replace(/^\/+/, "");
    if (inferredHome) {
      const absolutePath = suffix ? `${inferredHome}/${suffix}` : inferredHome;
      return buildResolvedTarget(absolutePath, cleaned, false);
    }
    const commandPath = suffix ? `$HOME/${suffix}` : "$HOME";
    const displayPath = suffix ? `~/${suffix}` : "~";
    return buildResolvedTarget(commandPath, displayPath, true);
  }

  const desktopMatch = cleaned.match(/^desktop(?:\/(.*))?$/i);
  if (desktopMatch) {
    const suffix = (desktopMatch[1] || "").replace(/^\/+/, "");
    const displayPath = suffix ? `~/Desktop/${suffix}` : "~/Desktop";
    if (inferredHome) {
      const absolutePath = suffix ? `${inferredHome}/Desktop/${suffix}` : `${inferredHome}/Desktop`;
      return buildResolvedTarget(absolutePath, displayPath, false);
    }
    const commandPath = suffix ? `$HOME/Desktop/${suffix}` : "$HOME/Desktop";
    return buildResolvedTarget(commandPath, displayPath, true);
  }

  if (!normalizedBaseDirectory) {
    return buildResolvedTarget(cleaned, cleaned, false);
  }

  const relativePath = cleaned.replace(/^\/+/, "");
  return buildResolvedTarget(`${normalizedBaseDirectory}/${relativePath}`, `${normalizedBaseDirectory}/${relativePath}`, false);
}

export function formatAssistantShellPath(commandPath: string, shellExpandable: boolean): string {
  if (!shellExpandable) {
    return `'${commandPath.replace(/'/g, `'\\''`)}'`;
  }
  return `"${commandPath.replace(/([\\"`])/g, "\\$1")}"`;
}

export type TeamPolicySettings = {
  enforceDangerConfirm: boolean | null;
  commandBlocklist: string[];
  sessionTimeoutMinutes: number | null;
};

function parseRegexPattern(pattern: string): RegExp | null {
  const trimmed = pattern.trim();
  if (!trimmed) {
    return null;
  }

  // Accept literal /pattern/flags form.
  if (trimmed.startsWith("/") && trimmed.lastIndexOf("/") > 0) {
    const finalSlash = trimmed.lastIndexOf("/");
    const body = trimmed.slice(1, finalSlash);
    const flags = trimmed.slice(finalSlash + 1);
    try {
      return new RegExp(body, flags || "i");
    } catch {
      return null;
    }
  }

  try {
    return new RegExp(trimmed, "i");
  } catch {
    return null;
  }
}

export function normalizeCommandBlocklist(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const deduped = new Set<string>();
  value.forEach((entry) => {
    if (typeof entry !== "string") {
      return;
    }
    const normalized = entry.trim();
    if (!normalized) {
      return;
    }
    deduped.add(normalized);
  });
  return Array.from(deduped.values());
}

export function normalizeSessionTimeoutMinutes(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : null;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  return null;
}

export function findBlockedCommandPattern(command: string, patterns: string[]): string | null {
  const value = command.trim();
  if (!value) {
    return null;
  }
  for (const pattern of patterns) {
    const regex = parseRegexPattern(pattern);
    if (!regex) {
      continue;
    }
    if (regex.test(value)) {
      return pattern;
    }
  }
  return null;
}

export function resolveSessionTimeoutMs(timeoutMinutes: number | null): number | null {
  if (!timeoutMinutes || timeoutMinutes <= 0) {
    return null;
  }
  return timeoutMinutes * 60 * 1000;
}

export const teamPolicyTestUtils = {
  parseRegexPattern,
};

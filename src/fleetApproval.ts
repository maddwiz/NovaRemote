import { TeamFleetApproval } from "./types";

function normalizeCommand(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function normalizeTargets(targets: string[]): string[] {
  return Array.from(
    new Set(
      targets
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  ).sort();
}

function equalTargets(a: string[], b: string[]): boolean {
  if (a.length !== b.length) {
    return false;
  }
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) {
      return false;
    }
  }
  return true;
}

export function findApprovedFleetApproval(
  approvals: TeamFleetApproval[],
  command: string,
  targets: string[],
  requesterId?: string | null
): TeamFleetApproval | null {
  const normalizedCommand = normalizeCommand(command);
  const normalizedTargets = normalizeTargets(targets);
  const requester = requesterId?.trim() || "";
  if (!normalizedCommand || normalizedTargets.length === 0) {
    return null;
  }

  for (const approval of approvals) {
    if (approval.status !== "approved") {
      continue;
    }
    if (requester && approval.requestedByUserId !== requester) {
      continue;
    }
    if (normalizeCommand(approval.command) !== normalizedCommand) {
      continue;
    }
    if (!equalTargets(normalizeTargets(approval.targets), normalizedTargets)) {
      continue;
    }
    return approval;
  }

  return null;
}

export const fleetApprovalTestUtils = {
  normalizeCommand,
  normalizeTargets,
  equalTargets,
};

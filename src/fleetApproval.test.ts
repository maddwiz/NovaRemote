import { describe, expect, it } from "vitest";

import { findApprovedFleetApproval, findPendingFleetApproval, fleetApprovalTestUtils } from "./fleetApproval";
import { TeamFleetApproval } from "./types";

function approval(overrides: Partial<TeamFleetApproval>): TeamFleetApproval {
  return {
    id: "approval-1",
    command: "docker compose up -d",
    requestedByUserId: "user-1",
    requestedByEmail: "user@example.com",
    targets: ["dgx", "home"],
    createdAt: "2026-03-05T00:00:00.000Z",
    updatedAt: "2026-03-05T00:00:00.000Z",
    status: "approved",
    ...overrides,
  };
}

describe("fleetApproval", () => {
  it("matches approved requests by normalized command and target set", () => {
    const approvals: TeamFleetApproval[] = [
      approval({
        id: "approval-2",
        status: "pending",
      }),
      approval({
        id: "approval-3",
      }),
    ];
    const match = findApprovedFleetApproval(approvals, "  docker   compose  up -d ", ["home", "dgx"], "user-1");
    expect(match?.id).toBe("approval-3");
  });

  it("does not match approvals for a different requester", () => {
    const approvals: TeamFleetApproval[] = [
      approval({
        requestedByUserId: "user-2",
      }),
    ];
    expect(findApprovedFleetApproval(approvals, "docker compose up -d", ["dgx", "home"], "user-1")).toBeNull();
  });

  it("does not reuse approvals that are already claimed or completed", () => {
    const approvals: TeamFleetApproval[] = [
      approval({
        id: "approval-claimed",
        executionClaimedAt: "2026-03-05T01:00:00.000Z",
      }),
      approval({
        id: "approval-completed",
        executionCompletedAt: "2026-03-05T01:05:00.000Z",
      }),
    ];
    expect(findApprovedFleetApproval(approvals, "docker compose up -d", ["dgx", "home"], "user-1")).toBeNull();
  });

  it("matches pending requests for the same command/targets/requester", () => {
    const approvals: TeamFleetApproval[] = [
      approval({
        id: "approval-pending",
        status: "pending",
      }),
      approval({
        id: "approval-approved",
        status: "approved",
      }),
    ];
    const pending = findPendingFleetApproval(approvals, "docker compose up -d", ["home", "dgx"], "user-1");
    expect(pending?.id).toBe("approval-pending");
  });

  it("normalizes targets consistently", () => {
    expect(fleetApprovalTestUtils.normalizeTargets(["DGX", "home", "dgx", ""])).toEqual(["dgx", "home"]);
  });
});

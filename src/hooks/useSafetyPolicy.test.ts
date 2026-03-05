import { describe, expect, it, vi } from "vitest";

vi.mock("expo-secure-store", () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => {}),
}));

import { decodeRequireDangerConfirm, encodeRequireDangerConfirm } from "./safetyPolicyCodec";
import { resolveDangerConfirmSetting } from "./useSafetyPolicy";

describe("useSafetyPolicy encoding", () => {
  it("decodes persisted values", () => {
    expect(decodeRequireDangerConfirm("1")).toBe(true);
    expect(decodeRequireDangerConfirm("0")).toBe(false);
    expect(decodeRequireDangerConfirm(null)).toBe(true);
  });

  it("encodes booleans", () => {
    expect(encodeRequireDangerConfirm(true)).toBe("1");
    expect(encodeRequireDangerConfirm(false)).toBe("0");
  });

  it("applies team-enforced override when provided", () => {
    expect(resolveDangerConfirmSetting(false, true)).toBe(true);
    expect(resolveDangerConfirmSetting(true, false)).toBe(false);
    expect(resolveDangerConfirmSetting(false, null)).toBe(false);
  });
});

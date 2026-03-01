import { describe, expect, it } from "vitest";

import { decodeRequireDangerConfirm, encodeRequireDangerConfirm } from "./safetyPolicyCodec";

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
});

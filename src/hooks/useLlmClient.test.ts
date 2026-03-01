import { describe, expect, it } from "vitest";

import { llmClientTestUtils } from "./useLlmClient";

describe("llmClientTestUtils", () => {
  it("parses extra headers safely", () => {
    const headers = llmClientTestUtils.parseExtraHeaders(
      "X-Foo: bar\nInvalid Header\nAuthorization: Bearer abc\nX-Num: 42"
    );

    expect(headers).toEqual({
      "X-Foo": "bar",
      Authorization: "Bearer abc",
      "X-Num": "42",
    });
  });

  it("maps commands to powershell backend", () => {
    expect(llmClientTestUtils.mapCommandToBackend("ls -la", "powershell")).toBe("Get-ChildItem -la");
    expect(llmClientTestUtils.mapCommandToBackend("cat /tmp/log", "pwsh")).toBe("Get-Content /tmp/log");
  });

  it("normalizes llm send options", () => {
    const normalized = llmClientTestUtils.normalizeOptions({
      imageUrl: "  https://example.com/x.png  ",
      enableBuiltInTools: true,
      maxToolRounds: 99,
      toolContext: {
        project: " NovaRemote ",
        empty: "   ",
      },
    });

    expect(normalized.imageUrl).toBe("https://example.com/x.png");
    expect(normalized.enableBuiltInTools).toBe(true);
    expect(normalized.maxToolRounds).toBe(5);
    expect(normalized.toolContext).toEqual({ project: "NovaRemote" });
  });
});

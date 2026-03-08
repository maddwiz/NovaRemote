import { describe, expect, it } from "vitest";

import {
  formatAssistantShellPath,
  inferPosixHomeDirectory,
  resolveAssistantFolderTarget,
} from "./assistantPath";

describe("inferPosixHomeDirectory", () => {
  it("infers mac home directories", () => {
    expect(inferPosixHomeDirectory("/Users/desmondpottle/Documents/New project/NovaRemote")).toBe("/Users/desmondpottle");
  });

  it("infers linux home directories", () => {
    expect(inferPosixHomeDirectory("/home/nova/project")).toBe("/home/nova");
  });

  it("returns null for non-home paths", () => {
    expect(inferPosixHomeDirectory("/srv/app")).toBeNull();
  });
});

describe("resolveAssistantFolderTarget", () => {
  it("resolves desktop paths against the inferred home directory", () => {
    expect(resolveAssistantFolderTarget("Desktop/novadez", "/Users/desmondpottle/Documents/New project")).toEqual({
      commandPath: "/Users/desmondpottle/Desktop/novadez",
      displayPath: "~/Desktop/novadez",
      parentPath: "/Users/desmondpottle/Desktop",
      shellExpandable: false,
    });
  });

  it("resolves tilde paths against the inferred home directory", () => {
    expect(resolveAssistantFolderTarget("~/Desktop/novadez", "/Users/desmondpottle/Documents/New project")).toEqual({
      commandPath: "/Users/desmondpottle/Desktop/novadez",
      displayPath: "~/Desktop/novadez",
      parentPath: "/Users/desmondpottle/Desktop",
      shellExpandable: false,
    });
  });

  it("keeps desktop paths shell-expandable when home cannot be inferred", () => {
    expect(resolveAssistantFolderTarget("Desktop/novadez", "/srv/app")).toEqual({
      commandPath: "$HOME/Desktop/novadez",
      displayPath: "~/Desktop/novadez",
      parentPath: null,
      shellExpandable: true,
    });
  });

  it("falls back to the active directory for relative paths", () => {
    expect(resolveAssistantFolderTarget("novadez", "/Users/desmondpottle/project")).toEqual({
      commandPath: "/Users/desmondpottle/project/novadez",
      displayPath: "/Users/desmondpottle/project/novadez",
      parentPath: "/Users/desmondpottle/project",
      shellExpandable: false,
    });
  });
});

describe("formatAssistantShellPath", () => {
  it("single-quotes literal paths", () => {
    expect(formatAssistantShellPath("/Users/desmondpottle/Desktop/novadez", false)).toBe("'/Users/desmondpottle/Desktop/novadez'");
  });

  it("double-quotes shell-expandable paths", () => {
    expect(formatAssistantShellPath("$HOME/Desktop/novadez", true)).toBe("\"$HOME/Desktop/novadez\"");
  });
});

import { describe, expect, it } from "vitest";

import {
  buildVoiceParticipantDirectory,
  deriveVoicePresence,
  resolveVoiceParticipantLabel,
  summarizeVoiceParticipants,
} from "./voicePresence";

describe("deriveVoicePresence", () => {
  it("collects unique remote participants from presence snapshots", () => {
    const presence = {
      main: [
        {
          id: "Engineer-A",
          name: "Engineer A",
          role: "editor" as const,
          readOnly: false,
          isSelf: false,
          lastSeenAt: 1_000,
        },
        {
          id: "local-user",
          name: "Local User",
          role: "owner" as const,
          readOnly: false,
          isSelf: true,
          lastSeenAt: 1_100,
        },
      ],
      build: [
        {
          id: " engineer-a ",
          name: "Engineer A",
          role: "editor" as const,
          readOnly: false,
          isSelf: false,
          lastSeenAt: 2_000,
        },
        {
          id: "Engineer-B",
          name: "Engineer B",
          role: "viewer" as const,
          readOnly: true,
          isSelf: false,
          lastSeenAt: null,
        },
      ],
    };

    const result = deriveVoicePresence(presence, { nowMs: 2_500, activeWindowMs: 10_000 });
    expect(result.remoteParticipantIds).toEqual(["engineer-a", "engineer-b"]);
  });

  it("derives active remote speaker from most recent collaborator activity", () => {
    const result = deriveVoicePresence(
      {
        main: [
          {
            id: "engineer-a",
            name: "Engineer A",
            role: "editor",
            readOnly: false,
            isSelf: false,
            lastSeenAt: 10_000,
          },
          {
            id: "engineer-b",
            name: "Engineer B",
            role: "editor",
            readOnly: false,
            isSelf: false,
            lastSeenAt: 12_000,
          },
        ],
      },
      { nowMs: 12_500, activeWindowMs: 5_000 }
    );
    expect(result.activeRemoteSpeakerId).toBe("engineer-b");
  });

  it("clears stale remote speakers outside the activity window", () => {
    const result = deriveVoicePresence(
      {
        main: [
          {
            id: "engineer-a",
            name: "Engineer A",
            role: "editor",
            readOnly: false,
            isSelf: false,
            lastSeenAt: 1_000,
          },
        ],
      },
      { nowMs: 40_000, activeWindowMs: 10_000 }
    );
    expect(result.remoteParticipantIds).toEqual(["engineer-a"]);
    expect(result.activeRemoteSpeakerId).toBeNull();
  });

  it("builds participant directory and resolves display labels", () => {
    const directory = buildVoiceParticipantDirectory(
      {
        main: [
          {
            id: "engineer-a",
            name: "Engineer A",
            role: "editor",
            readOnly: false,
            isSelf: false,
            lastSeenAt: 1_000,
          },
        ],
        build: [
          {
            id: "engineer-a",
            name: "Engineer Alpha",
            role: "editor",
            readOnly: false,
            isSelf: false,
            lastSeenAt: 2_000,
          },
        ],
      },
      [
        {
          id: "local-user",
          name: "Local User",
          role: "owner",
        },
      ]
    );

    expect(resolveVoiceParticipantLabel("engineer-a", directory)).toBe("Engineer Alpha");
    expect(resolveVoiceParticipantLabel("local-user", directory, { includeRole: true })).toBe("Local User (owner)");
    expect(resolveVoiceParticipantLabel("unknown-id", directory)).toBe("unknown-id");
    expect(
      summarizeVoiceParticipants(["local-user", "engineer-a", "unknown-id"], directory, {
        maxNames: 2,
      })
    ).toBe("Local User, Engineer Alpha +1");
  });
});

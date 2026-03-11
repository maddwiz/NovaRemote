import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAppContextMock, novaAgentPanelMock } = vi.hoisted(() => ({
  useAppContextMock: vi.fn(),
  novaAgentPanelMock: vi.fn(),
}));

vi.mock("../context/AppContext", () => ({
  useAppContext: () => useAppContextMock(),
}));

vi.mock("../components/NovaAgentPanel", () => ({
  NovaAgentPanel: (props: unknown) => {
    novaAgentPanelMock(props);
    return React.createElement("Text", null, "Mock NovaAgentPanel");
  },
}));

import { AgentsScreen } from "./AgentsScreen";

describe("AgentsScreen", () => {
  beforeEach(() => {
    useAppContextMock.mockReset();
    novaAgentPanelMock.mockReset();
  });

  it("renders the dedicated agents surface using the focused server context", async () => {
    const onShowPaywall = vi.fn();
    const onSendServerSessionCommand = vi.fn();
    useAppContextMock.mockReturnValue({
      terminals: {
        activeServer: {
          id: "macbook",
          name: "Macbook",
          baseUrl: "http://10.0.0.71:8787",
          token: "token",
          defaultCwd: "/workspace",
        },
        focusedServerId: "macbook",
        openSessions: ["main", "build"],
        isPro: true,
        connected: true,
        connections: new Map([["macbook", { connected: true }]]),
        onShowPaywall,
        onSendServerSessionCommand,
      },
    });

    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(AgentsScreen));
    });

    expect(() => renderer.root.findByProps({ children: "Agent Runtime" })).not.toThrow();
    expect(() => renderer.root.findByProps({ children: "Mock NovaAgentPanel" })).not.toThrow();
    expect(novaAgentPanelMock).toHaveBeenCalledWith(
      expect.objectContaining({
        serverId: "macbook",
        serverName: "Macbook",
        sessions: ["main", "build"],
        surface: "screen",
      })
    );

    await act(async () => {
      renderer.unmount();
    });
  });
});

export type VoiceRoutePanel = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
};

export type VoiceRoute =
  | { kind: "none" }
  | { kind: "show_all" }
  | { kind: "minimize" }
  | { kind: "rotate_workspace"; direction: "left" | "right" }
  | { kind: "focus_panel"; panelId: string }
  | { kind: "send_command"; panelId: string; command: string };

type ResolveVoiceRouteArgs = {
  transcript: string;
  panels: VoiceRoutePanel[];
  focusedPanelId: string | null;
};

export function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scorePanel(panel: VoiceRoutePanel, targetTokens: string[]): number {
  const server = normalizeForMatch(panel.serverName);
  const session = normalizeForMatch(panel.session);
  const sessionLabel = normalizeForMatch(panel.sessionLabel || panel.session);

  let score = 0;
  targetTokens.forEach((token) => {
    if (!token) {
      return;
    }
    if (server.includes(token)) {
      score += 2;
    }
    if (session.includes(token)) {
      score += 3;
    }
    if (sessionLabel.includes(token)) {
      score += 3;
    }
  });

  return score;
}

export function findPanelByTarget(panels: VoiceRoutePanel[], rawTarget: string): VoiceRoutePanel | null {
  const target = normalizeForMatch(rawTarget);
  if (!target) {
    return null;
  }

  const direct = panels.find((panel) => {
    const server = normalizeForMatch(panel.serverName);
    const session = normalizeForMatch(panel.session);
    const label = normalizeForMatch(panel.sessionLabel || panel.session);
    return server === target || session === target || label === target;
  });
  if (direct) {
    return direct;
  }

  const tokens = target.split(" ").filter(Boolean);
  if (tokens.length === 0) {
    return null;
  }

  let winner: VoiceRoutePanel | null = null;
  let winnerScore = 0;
  panels.forEach((panel) => {
    const score = scorePanel(panel, tokens);
    if (score <= winnerScore) {
      return;
    }
    winnerScore = score;
    winner = panel;
  });
  return winnerScore > 0 ? winner : null;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseExplicitSendWithoutColon(
  transcript: string,
  panels: VoiceRoutePanel[]
): { panelId: string; command: string } | null {
  const candidates = new Map<string, string>();

  panels.forEach((panel) => {
    [panel.serverName, panel.session, panel.sessionLabel].forEach((value) => {
      const target = value?.trim();
      if (!target) {
        return;
      }
      const key = normalizeForMatch(target);
      if (!key || candidates.has(key)) {
        return;
      }
      candidates.set(key, target);
    });
  });

  const orderedTargets = Array.from(candidates.values()).sort((a, b) => b.length - a.length);
  for (const target of orderedTargets) {
    const pattern = new RegExp(`^(?:send|route)\\s+to\\s+${escapeRegex(target)}\\s+(.+)$`, "i");
    const match = transcript.match(pattern);
    if (!match) {
      continue;
    }

    const command = match[1]?.trim() || "";
    if (!command) {
      continue;
    }

    const panel = findPanelByTarget(panels, target) ?? panels[0];
    return { panelId: panel.id, command };
  }

  return null;
}

function resolveFocusedPanelId(panels: VoiceRoutePanel[], focusedPanelId: string | null): string | null {
  if (focusedPanelId && panels.some((panel) => panel.id === focusedPanelId)) {
    return focusedPanelId;
  }
  return panels[0]?.id ?? null;
}

export function resolveSpatialVoiceRoute({ transcript, panels, focusedPanelId }: ResolveVoiceRouteArgs): VoiceRoute {
  const cleaned = transcript.trim();
  if (!cleaned || panels.length === 0) {
    return { kind: "none" };
  }

  const normalized = normalizeForMatch(cleaned);
  if (!normalized) {
    return { kind: "none" };
  }

  if (
    normalized === "show all" ||
    normalized === "show all panels" ||
    normalized === "overview" ||
    normalized === "show overview"
  ) {
    return { kind: "show_all" };
  }

  if (
    normalized === "minimize" ||
    normalized === "minimize panels" ||
    normalized === "focus mode" ||
    normalized === "single panel"
  ) {
    return { kind: "minimize" };
  }

  if (normalized === "rotate left" || normalized === "rotate workspace left" || normalized === "previous panel") {
    return { kind: "rotate_workspace", direction: "left" };
  }

  if (normalized === "rotate right" || normalized === "rotate workspace right" || normalized === "next panel") {
    return { kind: "rotate_workspace", direction: "right" };
  }

  const explicitSendMatch = cleaned.match(/^(?:send|route)\s+to\s+(.+?)\s*:\s*(.+)$/i);
  if (explicitSendMatch) {
    const target = explicitSendMatch[1]?.trim() || "";
    const command = explicitSendMatch[2]?.trim() || "";
    if (command) {
      const targetPanel = findPanelByTarget(panels, target) ?? panels[0];
      return { kind: "send_command", panelId: targetPanel.id, command };
    }
  }

  const explicitSendWithoutColon = parseExplicitSendWithoutColon(cleaned, panels);
  if (explicitSendWithoutColon) {
    return {
      kind: "send_command",
      panelId: explicitSendWithoutColon.panelId,
      command: explicitSendWithoutColon.command,
    };
  }

  const focusMatch = cleaned.match(/^focus(?:\s+(?:on|server|session|panel))?\s+(.+)$/i);
  if (focusMatch) {
    const target = focusMatch[1]?.trim() || "";
    const targetPanel = findPanelByTarget(panels, target);
    if (targetPanel) {
      return { kind: "focus_panel", panelId: targetPanel.id };
    }
  }

  const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
  if (!fallbackPanelId) {
    return { kind: "none" };
  }

  return {
    kind: "send_command",
    panelId: fallbackPanelId,
    command: cleaned,
  };
}

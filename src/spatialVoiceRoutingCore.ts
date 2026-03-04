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
  | { kind: "control_char"; panelId: string; char: string }
  | { kind: "stop_session"; panelId: string }
  | { kind: "open_on_mac"; panelId: string }
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

function ctrlCharForLetter(letter: string): string | null {
  const normalized = letter.trim().toLowerCase();
  if (!/^[a-z]$/.test(normalized)) {
    return null;
  }
  const code = normalized.charCodeAt(0);
  return String.fromCharCode(code - 96);
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
    normalized === "show all logs" ||
    normalized === "show me all logs" ||
    normalized === "overview" ||
    normalized === "show overview"
  ) {
    return { kind: "show_all" };
  }

  const showLogsMatch = cleaned.match(/^show(?:\s+me)?\s+(.+?)\s+logs?$/i);
  if (showLogsMatch) {
    const target = showLogsMatch[1]?.trim() || "";
    const targetPanel = findPanelByTarget(panels, target);
    if (targetPanel) {
      return { kind: "focus_panel", panelId: targetPanel.id };
    }
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

  const stopSessionMatch = cleaned.match(
    /^(?:stop|terminate|halt)\s+(?:session|terminal)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (stopSessionMatch) {
    const target = stopSessionMatch[1]?.trim() || stopSessionMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "stop_session", panelId };
  }

  const openOnMacMatch = cleaned.match(/^open(?:\s+(.+?))?\s+on\s+mac$/i);
  if (openOnMacMatch) {
    const target = openOnMacMatch[1]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "open_on_mac", panelId };
  }

  const openOnMacForMatch = cleaned.match(/^open\s+on\s+mac(?:\s+(?:for|on)\s+(.+))?$/i);
  if (openOnMacForMatch) {
    const target = openOnMacForMatch[1]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "open_on_mac", panelId };
  }

  const interruptMatch = cleaned.match(
    /^(?:interrupt|stop command|cancel command)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (interruptMatch) {
    const target = interruptMatch[1]?.trim() || interruptMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "control_char", panelId, char: "\u0003" };
  }

  const controlMatch = cleaned.match(
    /^(?:ctrl\s*\+?|control\s+)([a-z])(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (controlMatch) {
    const target = controlMatch[2]?.trim() || controlMatch[3]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    const char = ctrlCharForLetter(controlMatch[1] || "");
    if (!panelId || !char) {
      return { kind: "none" };
    }
    return { kind: "control_char", panelId, char };
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

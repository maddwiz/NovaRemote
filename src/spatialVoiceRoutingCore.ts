export type VoiceRoutePanel = {
  id: string;
  serverId: string;
  serverName: string;
  vmHost?: string;
  vmType?: string;
  vmName?: string;
  vmId?: string;
  session: string;
  sessionLabel: string;
};

export type VoiceRoute =
  | { kind: "none" }
  | { kind: "show_all" }
  | { kind: "minimize" }
  | { kind: "create_agent"; name: string; panelId?: string; allServers?: boolean }
  | { kind: "set_agent_goal"; name: string; goal: string; panelId?: string; allServers?: boolean }
  | { kind: "queue_agent_command"; name: string; command: string; panelId?: string; allServers?: boolean }
  | { kind: "approve_ready_agents"; panelId?: string }
  | { kind: "deny_all_pending_agents"; panelId?: string }
  | { kind: "pause_pool" }
  | { kind: "resume_pool" }
  | { kind: "rotate_workspace"; direction: "left" | "right" }
  | { kind: "focus_panel"; panelId: string }
  | { kind: "reconnect_server"; panelId: string }
  | { kind: "reconnect_all" }
  | { kind: "control_char"; panelId: string; char: string }
  | { kind: "stop_session"; panelId: string }
  | { kind: "open_on_mac"; panelId: string }
  | { kind: "share_live"; panelId: string }
  | { kind: "pin_panel"; panelId: string }
  | { kind: "unpin_panel"; panelId: string }
  | { kind: "add_panel"; panelId: string }
  | { kind: "remove_panel"; panelId: string }
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
  const vmHost = normalizeForMatch(panel.vmHost || "");
  const vmType = normalizeForMatch(panel.vmType || "");
  const vmName = normalizeForMatch(panel.vmName || "");
  const vmId = normalizeForMatch(panel.vmId || "");
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
    if (vmHost.includes(token)) {
      score += 2;
    }
    if (vmType.includes(token)) {
      score += 1;
    }
    if (vmName.includes(token)) {
      score += 2;
    }
    if (vmId.includes(token)) {
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
    const vmHost = normalizeForMatch(panel.vmHost || "");
    const vmType = normalizeForMatch(panel.vmType || "");
    const vmName = normalizeForMatch(panel.vmName || "");
    const vmId = normalizeForMatch(panel.vmId || "");
    const session = normalizeForMatch(panel.session);
    const label = normalizeForMatch(panel.sessionLabel || panel.session);
    return (
      server === target ||
      vmHost === target ||
      vmType === target ||
      vmName === target ||
      vmId === target ||
      session === target ||
      label === target
    );
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
    [panel.serverName, panel.vmHost, panel.vmType, panel.vmName, panel.vmId, panel.session, panel.sessionLabel].forEach((value) => {
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

function isAllServersTarget(target: string): boolean {
  const normalized = normalizeForMatch(target);
  return (
    normalized === "all" ||
    normalized === "all server" ||
    normalized === "all servers" ||
    normalized === "every server" ||
    normalized === "every servers" ||
    normalized === "everywhere"
  );
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

  if (
    normalized === "pause pool" ||
    normalized === "pause connection pool" ||
    normalized === "pause all servers" ||
    normalized === "pause all streams" ||
    normalized === "stop all streams"
  ) {
    return { kind: "pause_pool" };
  }

  if (
    normalized === "resume pool" ||
    normalized === "resume connection pool" ||
    normalized === "resume all servers" ||
    normalized === "resume all streams" ||
    normalized === "start all streams" ||
    normalized === "unpause pool"
  ) {
    return { kind: "resume_pool" };
  }

  if (normalized === "rotate left" || normalized === "rotate workspace left" || normalized === "previous panel") {
    return { kind: "rotate_workspace", direction: "left" };
  }

  if (normalized === "rotate right" || normalized === "rotate workspace right" || normalized === "next panel") {
    return { kind: "rotate_workspace", direction: "right" };
  }

  const reconnectMatch = cleaned.match(/^reconnect(?:\s+server)?(?:\s+(.+))?$/i);
  if (reconnectMatch) {
    const target = reconnectMatch[1]?.trim() || "";
    if (!target || normalizeForMatch(target) === "all" || normalizeForMatch(target) === "all servers") {
      return { kind: "reconnect_all" };
    }
    const panel = findPanelByTarget(panels, target);
    if (panel) {
      return { kind: "reconnect_server", panelId: panel.id };
    }
    return { kind: "none" };
  }

  const createAgentMatch = cleaned.match(
    /^(?:create|add|spawn)\s+agent\s+(.+?)(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (createAgentMatch) {
    const name = createAgentMatch[1]?.trim() || "";
    if (!name) {
      return { kind: "none" };
    }
    const target = createAgentMatch[2]?.trim() || "";
    if (!target) {
      return { kind: "create_agent", name };
    }
    if (isAllServersTarget(target)) {
      return { kind: "create_agent", name, allServers: true };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "create_agent", name: `${name} for ${target}`.trim() };
    }
    return { kind: "create_agent", name, panelId: targetPanel.id };
  }

  const setGoalMatch = cleaned.match(
    /^(?:set\s+agent\s+(.+?)\s+goal|agent\s+(.+?)\s+goal)\s+(.+?)(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (setGoalMatch) {
    const name = (setGoalMatch[1] || setGoalMatch[2] || "").trim();
    const goal = (setGoalMatch[3] || "").trim();
    const target = (setGoalMatch[4] || "").trim();
    if (!name || !goal) {
      return { kind: "none" };
    }
    if (!target) {
      return { kind: "set_agent_goal", name, goal };
    }
    if (isAllServersTarget(target)) {
      return { kind: "set_agent_goal", name, goal, allServers: true };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "set_agent_goal", name, goal: `${goal} for ${target}`.trim() };
    }
    return {
      kind: "set_agent_goal",
      name,
      goal,
      panelId: targetPanel.id,
    };
  }

  const queueAgentCommandMatch = cleaned.match(
    /^agent\s+(.+?)\s+(?:run|execute|queue)\s+(.+?)(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (queueAgentCommandMatch) {
    const name = (queueAgentCommandMatch[1] || "").trim();
    const command = (queueAgentCommandMatch[2] || "").trim();
    const target = (queueAgentCommandMatch[3] || "").trim();
    if (!name || !command) {
      return { kind: "none" };
    }
    if (!target) {
      return { kind: "queue_agent_command", name, command };
    }
    if (isAllServersTarget(target)) {
      return { kind: "queue_agent_command", name, command, allServers: true };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "queue_agent_command", name, command: `${command} for ${target}`.trim() };
    }
    return {
      kind: "queue_agent_command",
      name,
      command,
      panelId: targetPanel.id,
    };
  }

  const approveReadyAgentsMatch = cleaned.match(
    /^(?:approve(?:\s+ready)?\s+agents?|approve\s+all\s+agents?|run\s+ready\s+agents?)(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (approveReadyAgentsMatch) {
    const target = approveReadyAgentsMatch[1]?.trim() || "";
    if (!target) {
      return { kind: "approve_ready_agents" };
    }
    if (isAllServersTarget(target)) {
      return { kind: "approve_ready_agents" };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "none" };
    }
    return { kind: "approve_ready_agents", panelId: targetPanel.id };
  }

  const denyPendingAgentsMatch = cleaned.match(
    /^(?:deny|reject)\s+(?:all\s+)?(?:pending\s+)?agents?(?:\s+approvals?)?(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (denyPendingAgentsMatch) {
    const target = denyPendingAgentsMatch[1]?.trim() || "";
    if (!target) {
      return { kind: "deny_all_pending_agents" };
    }
    if (isAllServersTarget(target)) {
      return { kind: "deny_all_pending_agents" };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "none" };
    }
    return { kind: "deny_all_pending_agents", panelId: targetPanel.id };
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

  const shareLiveMatch = cleaned.match(
    /^(?:share|create|generate)\s+(?:live|spectate|spectator)(?:\s+session)?(?:\s+link)?(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (shareLiveMatch) {
    const target = shareLiveMatch[1]?.trim() || shareLiveMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "share_live", panelId };
  }

  const pinPanelMatch = cleaned.match(
    /^(?:pin|keep)\s+(?:this\s+)?(?:panel|session|terminal)?(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (pinPanelMatch) {
    const target = pinPanelMatch[1]?.trim() || pinPanelMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "pin_panel", panelId };
  }

  const unpinPanelMatch = cleaned.match(
    /^(?:unpin|un-pin|remove\s+pin)\s+(?:this\s+)?(?:panel|session|terminal)?(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (unpinPanelMatch) {
    const target = unpinPanelMatch[1]?.trim() || unpinPanelMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "unpin_panel", panelId };
  }

  const addPanelMatch = cleaned.match(
    /^(?:add|show|open)\s+(?:panel|session|terminal)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (addPanelMatch) {
    const target = addPanelMatch[1]?.trim() || addPanelMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "add_panel", panelId };
  }

  const removePanelMatch = cleaned.match(
    /^(?:remove|close|hide)\s+(?:panel|session|terminal)(?:\s+(?:for|on)\s+(.+)|\s+(.+))?$/i
  );
  if (removePanelMatch) {
    const target = removePanelMatch[1]?.trim() || removePanelMatch[2]?.trim() || "";
    const panelId = (target ? findPanelByTarget(panels, target)?.id : null) || resolveFocusedPanelId(panels, focusedPanelId);
    if (!panelId) {
      return { kind: "none" };
    }
    return { kind: "remove_panel", panelId };
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

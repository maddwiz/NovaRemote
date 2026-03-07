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

export type VoiceRoutePanelPosition = "left" | "center" | "right" | "above" | "below";

export type VoiceRoute =
  | { kind: "none" }
  | { kind: "show_all" }
  | { kind: "minimize" }
  | { kind: "create_session"; serverId: string; sessionKind: "ai" | "shell"; prompt?: string }
  | { kind: "close_panel"; panelId: string }
  | { kind: "resize_panel"; panelId: string; scale: "double" | "half" | "fullscreen" | "normal" }
  | { kind: "move_panel"; panelId: string; position: VoiceRoutePanelPosition }
  | { kind: "swap_panels"; panelIdA: string; panelIdB: string }
  | { kind: "create_agent"; name: string; panelId?: string; allServers?: boolean }
  | { kind: "remove_agent"; name: string; panelId?: string; allServers?: boolean }
  | { kind: "set_agent_status"; name: string; status: "idle" | "monitoring" | "executing" | "waiting_approval"; panelId?: string; allServers?: boolean }
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

function normalizeAgentStatus(value: string): "idle" | "monitoring" | "executing" | "waiting_approval" | null {
  const normalized = normalizeForMatch(value);
  if (!normalized) {
    return null;
  }
  if (normalized === "idle" || normalized === "standby" || normalized === "pause" || normalized === "paused") {
    return "idle";
  }
  if (normalized === "monitoring" || normalized === "monitor" || normalized === "watching" || normalized === "watch") {
    return "monitoring";
  }
  if (
    normalized === "executing" ||
    normalized === "execute" ||
    normalized === "running" ||
    normalized === "run" ||
    normalized === "active"
  ) {
    return "executing";
  }
  if (
    normalized === "waiting approval" ||
    normalized === "waiting for approval" ||
    normalized === "awaiting approval" ||
    normalized === "pending approval" ||
    normalized === "pending"
  ) {
    return "waiting_approval";
  }
  return null;
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

  const createAiMatch = cleaned.match(
    /^(?:open|start|new|launch)\s+(?:codex|ai|ai\s+session|ai\s+cli|codex\s+cli|assistant)(?:\s+(?:on|for)\s+(.+?))?(?:\s+(?:with\s+prompt|prompt|and\s+ask)\s+(.+))?$/i
  );
  if (createAiMatch) {
    const targetName = createAiMatch[1]?.trim() || "";
    const prompt = createAiMatch[2]?.trim() || "";
    const targetPanel = targetName ? findPanelByTarget(panels, targetName) : null;
    const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
    const focusedPanel = fallbackPanelId ? panels.find((panel) => panel.id === fallbackPanelId) || null : null;
    const serverId = targetPanel?.serverId || focusedPanel?.serverId || panels[0]?.serverId || null;
    if (serverId) {
      return {
        kind: "create_session",
        serverId,
        sessionKind: "ai",
        ...(prompt ? { prompt } : {}),
      };
    }
  }

  const createShellMatch = cleaned.match(
    /^(?:open|start|new|launch)\s+(?:terminal|shell|session|bash|zsh)(?:\s+(?:on|for)\s+(.+?))?(?:\s+(?:and\s+run|run|with\s+command|with\s+cmd)\s+(.+))?$/i
  );
  if (createShellMatch) {
    const targetName = createShellMatch[1]?.trim() || "";
    const prompt = createShellMatch[2]?.trim() || "";
    const targetPanel = targetName ? findPanelByTarget(panels, targetName) : null;
    const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
    const focusedPanel = fallbackPanelId ? panels.find((panel) => panel.id === fallbackPanelId) || null : null;
    const serverId = targetPanel?.serverId || focusedPanel?.serverId || panels[0]?.serverId || null;
    if (serverId) {
      return {
        kind: "create_session",
        serverId,
        sessionKind: "shell",
        ...(prompt ? { prompt } : {}),
      };
    }
  }

  if (/^remove\s+(?:this(?:\s+panel)?|that(?:\s+panel)?)$/i.test(cleaned)) {
    const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
    if (fallbackPanelId) {
      return { kind: "close_panel", panelId: fallbackPanelId };
    }
  }

  const closeMatch = cleaned.match(
    /^(?:close|dismiss|remove|kill|shut)\s+(?:this(?:\s+panel)?|that(?:\s+panel)?|panel|terminal|(.+))$/i
  );
  const closeTargetedTerminalMatch = cleaned.match(
    /^(?:close|dismiss|kill|shut)\s+(?:panel|terminal|session)\s+(.+)$/i
  );
  if (closeTargetedTerminalMatch) {
    const rawTarget = closeTargetedTerminalMatch[1]?.trim() || "";
    const targetName = rawTarget.replace(/^(?:for|on)\s+/i, "").trim();
    if (targetName) {
      const targetPanel = findPanelByTarget(panels, targetName);
      if (targetPanel) {
        return { kind: "close_panel", panelId: targetPanel.id };
      }
    }
  }
  if (closeMatch) {
    const targetName = closeMatch[1]?.trim() || "";
    const delegatesToPanelVisibilityRoute = /^(?:remove|close|hide)\s+(?:panel|session|terminal)\b/i.test(cleaned);
    if (delegatesToPanelVisibilityRoute || (targetName && /^agent\b/i.test(targetName))) {
      // Let agent-specific routes resolve commands like "remove agent deploy bot".
    } else {
      if (targetName) {
        const targetPanel = findPanelByTarget(panels, targetName);
        if (targetPanel) {
          return { kind: "close_panel", panelId: targetPanel.id };
        }
      }
      const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
      if (fallbackPanelId) {
        return { kind: "close_panel", panelId: fallbackPanelId };
      }
    }
  }

  const resizeTargetMatch = cleaned.match(
    /^(double|fullscreen|maximize|enlarge|shrink|minimize)\s+(.+)$/i
  );
  if (resizeTargetMatch) {
    const verb = normalizeForMatch(resizeTargetMatch[1] || "");
    const targetName = resizeTargetMatch[2]?.trim() || "";
    const targetPanel = findPanelByTarget(panels, targetName);
    if (targetPanel) {
      const scale =
        verb === "shrink" || verb === "minimize"
          ? "half"
          : verb === "fullscreen" || verb === "maximize"
            ? "fullscreen"
            : "double";
      return { kind: "resize_panel", panelId: targetPanel.id, scale };
    }
  }

  const resizePatterns: Array<{ pattern: RegExp; scale: "double" | "half" | "fullscreen" | "normal" }> = [
    { pattern: /^(?:double\s+(?:size|this)|make\s+(?:it\s+)?bigger|enlarge|grow|scale\s+up|bigger)$/i, scale: "double" },
    { pattern: /^(?:half\s+(?:size|this)|make\s+(?:it\s+)?smaller|shrink(?:\s+this)?|scale\s+down|smaller)$/i, scale: "half" },
    { pattern: /^(?:full\s*screen|go\s+full|maximize|max(?:\s+size)?)$/i, scale: "fullscreen" },
    { pattern: /^(?:normal\s+(?:size|mode)|reset\s+(?:size|scale)|default\s+size|restore(?:\s+size)?)$/i, scale: "normal" },
  ];
  for (const { pattern, scale } of resizePatterns) {
    if (!pattern.test(cleaned)) {
      continue;
    }
    const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
    if (fallbackPanelId) {
      return { kind: "resize_panel", panelId: fallbackPanelId, scale };
    }
  }

  const swapMatch = cleaned.match(
    /^(?:swap|switch|exchange)\s+(.+?)\s+(?:and|with)\s+(.+)$/i
  );
  if (swapMatch) {
    const panelA = findPanelByTarget(panels, swapMatch[1]?.trim() || "");
    const panelB = findPanelByTarget(panels, swapMatch[2]?.trim() || "");
    if (panelA && panelB && panelA.id !== panelB.id) {
      return { kind: "swap_panels", panelIdA: panelA.id, panelIdB: panelB.id };
    }
  }

  const moveMatch = cleaned.match(
    /^(?:move|put|pull|place|bring)(?:\s+(?:this|that|it|(.+?)))?\s+(?:to\s+(?:the\s+)?)?(?:in\s+front(?:\s+of\s+me)?|(left|right|center|above|below|top|bottom|middle|front))$/i
  );
  if (moveMatch) {
    const targetName = moveMatch[1]?.trim() || "";
    const rawPosition = (moveMatch[2] || "center").toLowerCase();
    const positionMap: Record<string, VoiceRoutePanelPosition> = {
      left: "left",
      right: "right",
      center: "center",
      front: "center",
      middle: "center",
      above: "above",
      top: "above",
      below: "below",
      bottom: "below",
    };
    const position = positionMap[rawPosition] || "center";
    const targetPanel = targetName ? findPanelByTarget(panels, targetName) : null;
    const panelId = targetPanel?.id || resolveFocusedPanelId(panels, focusedPanelId);
    if (panelId) {
      return { kind: "move_panel", panelId, position };
    }
  }

  const pullUpMatch = cleaned.match(/^pull\s+up\s+(.+)$/i);
  if (/^pull\s+up(?:\s+in\s+front(?:\s+of\s+me)?)?$/i.test(cleaned)) {
    const fallbackPanelId = resolveFocusedPanelId(panels, focusedPanelId);
    if (fallbackPanelId) {
      return { kind: "move_panel", panelId: fallbackPanelId, position: "center" };
    }
  }
  if (pullUpMatch) {
    const targetName = pullUpMatch[1]?.trim() || "";
    const targetPanel = findPanelByTarget(panels, targetName);
    if (targetPanel) {
      return { kind: "move_panel", panelId: targetPanel.id, position: "center" };
    }
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

  const removeAgentMatch = cleaned.match(
    /^(?:remove|delete)\s+agent\s+(.+?)(?:\s+(?:for|on)\s+(.+))?$/i
  );
  if (removeAgentMatch) {
    const name = removeAgentMatch[1]?.trim() || "";
    if (!name) {
      return { kind: "none" };
    }
    const target = removeAgentMatch[2]?.trim() || "";
    if (!target) {
      return { kind: "remove_agent", name };
    }
    if (isAllServersTarget(target)) {
      return { kind: "remove_agent", name, allServers: true };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "remove_agent", name: `${name} for ${target}`.trim() };
    }
    return { kind: "remove_agent", name, panelId: targetPanel.id };
  }

  const setStatusMatch = cleaned.match(
    /^(?:set\s+agent\s+(.+?)\s+status|agent\s+(.+?)\s+status)\s+(.+)$/i
  );
  if (setStatusMatch) {
    const name = (setStatusMatch[1] || setStatusMatch[2] || "").trim();
    const remainder = (setStatusMatch[3] || "").trim();
    if (!name || !remainder) {
      return { kind: "none" };
    }

    let status = normalizeAgentStatus(remainder);
    let target = "";
    if (!status) {
      const targetMatch = remainder.match(/^(.*)\s+(?:for|on)\s+(.+)$/i);
      if (targetMatch) {
        const statusPart = (targetMatch[1] || "").trim();
        const targetPart = (targetMatch[2] || "").trim();
        const resolvedStatus = normalizeAgentStatus(statusPart);
        if (resolvedStatus) {
          status = resolvedStatus;
          target = targetPart;
        }
      }
    }

    if (!status) {
      return { kind: "none" };
    }
    if (!target) {
      return { kind: "set_agent_status", name, status };
    }
    if (isAllServersTarget(target)) {
      return { kind: "set_agent_status", name, status, allServers: true };
    }
    const targetPanel = findPanelByTarget(panels, target);
    if (!targetPanel) {
      return { kind: "none" };
    }
    return { kind: "set_agent_status", name, status, panelId: targetPanel.id };
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

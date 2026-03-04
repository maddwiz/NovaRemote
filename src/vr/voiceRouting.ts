export type VrRoutePanel = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
};

export type VrVoiceIntent =
  | { kind: "none" }
  | { kind: "focus"; panelId: string }
  | { kind: "send"; panelId: string; command: string }
  | { kind: "overview" }
  | { kind: "minimize" }
  | { kind: "rotate_workspace"; direction: "left" | "right" };

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function findVrPanelByTarget(panels: VrRoutePanel[], target: string): VrRoutePanel | null {
  const needle = normalize(target);
  if (!needle) {
    return null;
  }

  const exact = panels.find((panel) => {
    return (
      normalize(panel.serverName) === needle ||
      normalize(panel.session) === needle ||
      normalize(panel.sessionLabel) === needle
    );
  });
  if (exact) {
    return exact;
  }

  const tokens = needle.split(" ").filter(Boolean);
  let best: VrRoutePanel | null = null;
  let bestScore = 0;
  panels.forEach((panel) => {
    const haystack = `${normalize(panel.serverName)} ${normalize(panel.session)} ${normalize(panel.sessionLabel)}`;
    const score = tokens.reduce((sum, token) => (haystack.includes(token) ? sum + 1 : sum), 0);
    if (score > bestScore) {
      best = panel;
      bestScore = score;
    }
  });
  return bestScore > 0 ? best : null;
}

export function parseVrVoiceIntent(transcript: string, panels: VrRoutePanel[], focusedPanelId: string | null): VrVoiceIntent {
  const raw = transcript.trim();
  if (!raw || panels.length === 0) {
    return { kind: "none" };
  }

  const normalized = normalize(raw);
  if (normalized === "overview" || normalized === "show all" || normalized === "show overview") {
    return { kind: "overview" };
  }
  if (
    normalized === "minimize" ||
    normalized === "minimize panels" ||
    normalized === "focus mode" ||
    normalized === "single panel"
  ) {
    return { kind: "minimize" };
  }
  if (normalized === "rotate left") {
    return { kind: "rotate_workspace", direction: "left" };
  }
  if (normalized === "rotate right") {
    return { kind: "rotate_workspace", direction: "right" };
  }

  const sendMatch = raw.match(/^(?:send|route)\s+to\s+(.+?)\s*:\s*(.+)$/i);
  if (sendMatch) {
    const panel = findVrPanelByTarget(panels, sendMatch[1] || "");
    const command = (sendMatch[2] || "").trim();
    if (panel && command) {
      return { kind: "send", panelId: panel.id, command };
    }
  }

  const focusMatch = raw.match(/^focus\s+(.+)$/i);
  if (focusMatch) {
    const panel = findVrPanelByTarget(panels, focusMatch[1] || "");
    if (panel) {
      return { kind: "focus", panelId: panel.id };
    }
  }

  const fallbackId = focusedPanelId && panels.some((panel) => panel.id === focusedPanelId) ? focusedPanelId : panels[0].id;
  return { kind: "send", panelId: fallbackId, command: raw };
}

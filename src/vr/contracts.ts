export const VR_PROTOCOL_VERSION = "1.0.0" as const;

export type VrTerminalApiBasePath = "/tmux" | "/terminal";

export type VrSessionMeta = {
  name: string;
  created_at?: string;
  attached?: boolean;
  windows?: number;
};

export type VrStreamMessageType = "snapshot" | "delta" | "session_closed" | "error";

export type VrStreamMessage = {
  type: VrStreamMessageType;
  session: string;
  data: string;
};

export type VrLayoutPreset = "arc" | "grid" | "stacked" | "cockpit" | "custom";

export type VrPanelTransform = {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch?: number;
  roll?: number;
  width?: number;
  height?: number;
  index?: number;
};

export type VrPanelState = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
  pinned?: boolean;
  readOnly?: boolean;
  transform: VrPanelTransform;
};

export type VrWorkspaceSnapshot = {
  version: typeof VR_PROTOCOL_VERSION;
  preset: VrLayoutPreset;
  focusedPanelId: string | null;
  panelIds: string[];
  pinnedPanelIds: string[];
  overviewMode?: boolean;
  customTransforms?: Record<string, VrPanelTransform>;
};

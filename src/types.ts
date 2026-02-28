export type SessionMeta = {
  name: string;
  created_at?: string;
  attached?: boolean;
  windows?: number;
};

export type CodexStartResponse = {
  ok: boolean;
  session: string;
  tail?: string;
  open_on_mac?: {
    requested: boolean;
    opened: boolean;
    error: string | null;
  };
};

export type CodexMessageResponse = {
  ok: boolean;
  session: string;
  tail?: string;
};

export type ShellRunResponse = {
  ok: boolean;
  session: string;
  output?: string;
};

export type TmuxTailResponse = {
  session: string;
  output?: string;
};

export type TmuxStreamMessage = {
  type: "delta" | "snapshot" | "session_closed" | "error";
  session: string;
  data: string;
};

export type ServerProfile = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
  defaultCwd: string;
};

export type TerminalSendMode = "ai" | "shell";

export type RouteTab = "terminals" | "servers";

export type Status = {
  text: string;
  error: boolean;
};

import { apiRequest, normalizeBaseUrl } from "../api/client";
import { VrSessionMeta, VrTerminalApiBasePath } from "./contracts";

export type VrServerTarget = {
  id: string;
  name: string;
  baseUrl: string;
  token: string;
};

export type VrSessionClient = {
  listSessions: (server: VrServerTarget, basePath: VrTerminalApiBasePath) => Promise<VrSessionMeta[]>;
  createSession: (server: VrServerTarget, basePath: VrTerminalApiBasePath, session: string, cwd: string) => Promise<void>;
  send: (server: VrServerTarget, basePath: VrTerminalApiBasePath, session: string, text: string, enter?: boolean) => Promise<void>;
  ctrl: (server: VrServerTarget, basePath: VrTerminalApiBasePath, session: string, key: string) => Promise<void>;
  stopSession: (server: VrServerTarget, basePath: VrTerminalApiBasePath, session: string) => Promise<void>;
  openOnMac: (server: VrServerTarget, session: string) => Promise<void>;
  tail: (server: VrServerTarget, basePath: VrTerminalApiBasePath, session: string, lines?: number) => Promise<string>;
  health: (server: VrServerTarget) => Promise<{ ok: boolean; latencyMs: number | null }>;
};

export function createVrSessionClient(): VrSessionClient {
  return {
    async listSessions(server, basePath) {
      const data = await apiRequest<{ sessions: VrSessionMeta[] }>(
        server.baseUrl,
        server.token,
        `${basePath}/sessions`
      );
      return Array.isArray(data.sessions) ? data.sessions : [];
    },

    async createSession(server, basePath, session, cwd) {
      await apiRequest(server.baseUrl, server.token, `${basePath}/session`, {
        method: "POST",
        body: JSON.stringify({ session, cwd }),
      });
    },

    async send(server, basePath, session, text, enter = true) {
      await apiRequest(server.baseUrl, server.token, `${basePath}/send`, {
        method: "POST",
        body: JSON.stringify({ session, text, enter }),
      });
    },

    async ctrl(server, basePath, session, key) {
      await apiRequest(server.baseUrl, server.token, `${basePath}/ctrl`, {
        method: "POST",
        body: JSON.stringify({ session, key }),
      });
    },

    async stopSession(server, basePath, session) {
      await apiRequest(server.baseUrl, server.token, `${basePath}/ctrl`, {
        method: "POST",
        body: JSON.stringify({ session, key: "C-c" }),
      });
    },

    async openOnMac(server, session) {
      await apiRequest(server.baseUrl, server.token, "/mac/attach", {
        method: "POST",
        body: JSON.stringify({ session }),
      });
    },

    async tail(server, basePath, session, lines = 240) {
      const payload = await apiRequest<{ output?: string }>(
        server.baseUrl,
        server.token,
        `${basePath}/tail?session=${encodeURIComponent(session)}&lines=${Math.max(20, Math.min(lines, 1000))}`
      );
      return payload.output || "";
    },

    async health(server) {
      const startedAt = Date.now();
      try {
        const response = await fetch(`${normalizeBaseUrl(server.baseUrl)}/health`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${server.token}`,
          },
        });
        if (!response.ok) {
          return { ok: false, latencyMs: null };
        }
        return { ok: true, latencyMs: Date.now() - startedAt };
      } catch {
        return { ok: false, latencyMs: null };
      }
    },
  };
}

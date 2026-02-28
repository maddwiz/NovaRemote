export function normalizeBaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function websocketUrl(baseUrl: string, session: string): string {
  const safeBase = normalizeBaseUrl(baseUrl);
  const wsBase = safeBase.replace(/^http:\/\//i, "ws://").replace(/^https:\/\//i, "wss://");
  return `${wsBase}/tmux/stream?session=${encodeURIComponent(session)}`;
}

export async function apiRequest<T>(
  baseUrl: string,
  token: string,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(`${normalizeBaseUrl(baseUrl)}${path}`, { ...init, headers });
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload.detail) {
        detail = `${response.status} ${payload.detail}`;
      }
    } catch {
      // Ignore JSON parse failures.
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

import { NOVA_CLOUD_DEFAULT_URL } from "../constants";

function normalizeCloudUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

export function getNovaCloudUrl(): string {
  const envValue = typeof process !== "undefined" ? process.env.EXPO_PUBLIC_NOVA_CLOUD_URL || "" : "";
  return normalizeCloudUrl(envValue || NOVA_CLOUD_DEFAULT_URL);
}

export async function cloudRequest<T>(
  path: string,
  init: RequestInit = {},
  options: {
    accessToken?: string | null;
    cloudUrl?: string;
    fetchImpl?: typeof fetch;
  } = {}
): Promise<T> {
  const clientFetch = options.fetchImpl || fetch;
  const cloudUrl = normalizeCloudUrl(options.cloudUrl || getNovaCloudUrl());
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;

  const headers = new Headers(init.headers);
  if (options.accessToken) {
    headers.set("Authorization", `Bearer ${options.accessToken}`);
  }
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await clientFetch(`${cloudUrl}${normalizedPath}`, {
    ...init,
    headers,
  });

  const rawText = await response.text();
  const hasBody = rawText.trim().length > 0;
  const maybeJson = hasBody ? safeJsonParse(rawText) : null;

  if (!response.ok) {
    const detail =
      (maybeJson && typeof maybeJson.detail === "string" && maybeJson.detail) ||
      (maybeJson && typeof maybeJson.error === "string" && maybeJson.error) ||
      rawText ||
      response.statusText ||
      "Request failed";
    throw new Error(`${response.status} ${detail}`.trim());
  }

  if (!hasBody) {
    return {} as T;
  }
  if (maybeJson) {
    return maybeJson as T;
  }
  throw new Error("Cloud API returned a non-JSON response.");
}

function safeJsonParse(raw: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(raw) as unknown;
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export const cloudClientTestUtils = {
  normalizeCloudUrl,
  safeJsonParse,
};

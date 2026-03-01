import * as Linking from "expo-linking";
import { useCallback } from "react";

export type QrServerConfig = {
  name: string;
  url: string;
  token: string;
  cwd: string;
  backend: string;
  sshHost: string;
  sshUser: string;
  sshPort: string;
};

function normalizeHttpUrl(raw: unknown): string {
  if (typeof raw !== "string") {
    return "";
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return "";
  }
  try {
    const parsed = new URL(trimmed);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol !== "http:" && protocol !== "https:") {
      return "";
    }
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return "";
  }
}

function toStringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function parseQrPayload(raw: string): QrServerConfig | null {
  const payload = raw.trim();
  if (!payload) {
    return null;
  }

  if (payload.startsWith("{")) {
    try {
      const parsed = JSON.parse(payload) as Record<string, unknown>;
      const url = normalizeHttpUrl(parsed.url ?? parsed.baseUrl);
      if (!url) {
        return null;
      }
      return {
        name: toStringValue(parsed.name),
        url,
        token: toStringValue(parsed.token),
        cwd: toStringValue(parsed.cwd ?? parsed.defaultCwd),
        backend: toStringValue(parsed.backend ?? parsed.terminalBackend),
        sshHost: toStringValue(parsed.sshHost ?? parsed.ssh_host),
        sshUser: toStringValue(parsed.sshUser ?? parsed.ssh_user),
        sshPort: toStringValue(parsed.sshPort ?? parsed.ssh_port),
      };
    } catch {
      return null;
    }
  }

  let parsedLink: ReturnType<typeof Linking.parse>;
  try {
    parsedLink = Linking.parse(payload);
  } catch {
    return null;
  }

  if (parsedLink.path !== "add-server") {
    return null;
  }

  const url = normalizeHttpUrl(
    typeof parsedLink.queryParams?.url === "string"
      ? parsedLink.queryParams.url
      : parsedLink.queryParams?.baseUrl
  );
  if (!url) {
    return null;
  }

  return {
    name: toStringValue(parsedLink.queryParams?.name),
    url,
    token: toStringValue(parsedLink.queryParams?.token),
    cwd: toStringValue(parsedLink.queryParams?.cwd),
    backend: toStringValue(parsedLink.queryParams?.backend),
    sshHost:
      typeof parsedLink.queryParams?.ssh_host === "string"
        ? parsedLink.queryParams.ssh_host.trim()
        : toStringValue(parsedLink.queryParams?.sshHost),
    sshUser:
      typeof parsedLink.queryParams?.ssh_user === "string"
        ? parsedLink.queryParams.ssh_user.trim()
        : toStringValue(parsedLink.queryParams?.sshUser),
    sshPort:
      typeof parsedLink.queryParams?.ssh_port === "string"
        ? parsedLink.queryParams.ssh_port.trim()
        : toStringValue(parsedLink.queryParams?.sshPort),
  };
}

export function useQrSetup() {
  const parse = useCallback((raw: string) => parseQrPayload(raw), []);
  return { parseQrPayload: parse };
}

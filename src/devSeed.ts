export type DevSeedServerConfig = {
  name?: string;
  baseUrl?: string;
  token?: string;
  defaultCwd?: string;
  sshHost?: string;
  sshUser?: string;
  sshPort?: string | number;
  portainerUrl?: string;
  proxmoxUrl?: string;
  grafanaUrl?: string;
};

export type DevSeedOllamaConfig = {
  name?: string;
  baseUrl?: string;
  model?: string;
};

type DevSeedConfig = {
  server?: DevSeedServerConfig;
  ollama?: DevSeedOllamaConfig;
};

let generatedConfigCache: DevSeedConfig | null | undefined;

function readEnvValue(name: string): string {
  if (typeof process === "undefined") {
    return "";
  }
  const raw = process.env[name];
  return typeof raw === "string" ? raw.trim() : "";
}

function envFlagEnabled(name: string): boolean {
  const value = readEnvValue(name).toLowerCase();
  return value === "1" || value === "true" || value === "yes" || value === "on";
}

function trimString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function loadGeneratedDevSeedConfig(): DevSeedConfig | null {
  if (typeof __DEV__ !== "undefined" && !__DEV__) {
    generatedConfigCache = null;
    return generatedConfigCache;
  }

  if (!envFlagEnabled("EXPO_PUBLIC_DEV_SEED_ENABLED")) {
    return null;
  }

  if (generatedConfigCache !== undefined) {
    return generatedConfigCache;
  }

  try {
    // Optional local-only runtime seed. Intentionally dynamic so the file can stay gitignored.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const moduleValue = require("./devSeed.generated");
    const rawConfig = (moduleValue?.DEV_SEED_CONFIG ?? moduleValue?.default ?? moduleValue) as DevSeedConfig | undefined;
    generatedConfigCache = rawConfig && typeof rawConfig === "object" ? rawConfig : null;
  } catch {
    generatedConfigCache = null;
  }

  return generatedConfigCache;
}

export function getDevSeedServerConfig(): DevSeedServerConfig | null {
  const generated = loadGeneratedDevSeedConfig()?.server;
  if (generated?.baseUrl && generated?.token) {
    return {
      name: trimString(generated.name),
      baseUrl: trimString(generated.baseUrl),
      token: trimString(generated.token),
      defaultCwd: trimString(generated.defaultCwd),
      sshHost: trimString(generated.sshHost),
      sshUser: trimString(generated.sshUser),
      sshPort: generated.sshPort,
      portainerUrl: trimString(generated.portainerUrl),
      proxmoxUrl: trimString(generated.proxmoxUrl),
      grafanaUrl: trimString(generated.grafanaUrl),
    };
  }

  if (!envFlagEnabled("EXPO_PUBLIC_DEV_SEED_ENABLED")) {
    return null;
  }

  const baseUrl = trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_URL"));
  const token = trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_TOKEN"));
  if (!baseUrl || !token) {
    return null;
  }

  return {
    name: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_NAME")),
    baseUrl,
    token,
    defaultCwd: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_CWD")),
    sshHost: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_SSH_HOST")),
    sshUser: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_SSH_USER")),
    sshPort: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_SSH_PORT")),
    portainerUrl: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_PORTAINER_URL")),
    proxmoxUrl: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_PROXMOX_URL")),
    grafanaUrl: trimString(readEnvValue("EXPO_PUBLIC_DEV_SERVER_GRAFANA_URL")),
  };
}

export function getDevSeedOllamaConfig(): DevSeedOllamaConfig | null {
  const generated = loadGeneratedDevSeedConfig()?.ollama;
  if (generated?.baseUrl || generated?.model || generated?.name) {
    return {
      name: trimString(generated.name),
      baseUrl: trimString(generated.baseUrl),
      model: trimString(generated.model),
    };
  }

  if (!envFlagEnabled("EXPO_PUBLIC_DEV_SEED_ENABLED")) {
    return null;
  }

  const name = trimString(readEnvValue("EXPO_PUBLIC_DEV_OLLAMA_NAME"));
  const baseUrl = trimString(readEnvValue("EXPO_PUBLIC_DEV_OLLAMA_URL"));
  const model = trimString(readEnvValue("EXPO_PUBLIC_DEV_OLLAMA_MODEL"));
  if (!name && !baseUrl && !model) {
    return null;
  }

  return { name, baseUrl, model };
}

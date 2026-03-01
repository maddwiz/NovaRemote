import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_SHARED_SERVER_TEMPLATES, makeId } from "../constants";
import { ServerProfile, SharedServerTemplate } from "../types";

type ImportSummary = {
  imported: number;
  skipped: number;
  total: number;
};

type ExportPayload = {
  version: number;
  exported_at: string;
  source: string;
  templates: Array<Omit<SharedServerTemplate, "id" | "importedAt">>;
};

function sanitizeSshPort(value: number | undefined): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }
  const rounded = Math.round(value);
  if (rounded < 1 || rounded > 65535) {
    return undefined;
  }
  return rounded;
}

function normalizeTemplate(input: Partial<SharedServerTemplate>): SharedServerTemplate | null {
  const name = (input.name || "").trim();
  const baseUrl = (input.baseUrl || "").trim();
  if (!name || !baseUrl) {
    return null;
  }

  return {
    id: input.id || makeId(),
    name,
    baseUrl,
    defaultCwd: (input.defaultCwd || "").trim(),
    terminalBackend: input.terminalBackend,
    sshHost: input.sshHost?.trim() || undefined,
    sshUser: input.sshUser?.trim() || undefined,
    sshPort: sanitizeSshPort(input.sshPort),
    importedAt: input.importedAt || new Date().toISOString(),
  };
}

function templateFingerprint(template: SharedServerTemplate): string {
  return [
    template.name.trim().toLowerCase(),
    template.baseUrl.trim().toLowerCase(),
    template.defaultCwd.trim().toLowerCase(),
    (template.terminalBackend || "auto").trim().toLowerCase(),
    (template.sshHost || "").trim().toLowerCase(),
    (template.sshUser || "").trim().toLowerCase(),
    String(template.sshPort || ""),
  ].join("|");
}

export function useSharedProfiles() {
  const [sharedTemplates, setSharedTemplates] = useState<SharedServerTemplate[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const raw = await SecureStore.getItemAsync(STORAGE_SHARED_SERVER_TEMPLATES);
      if (!mounted) {
        return;
      }
      if (!raw) {
        setSharedTemplates([]);
        return;
      }
      try {
        const parsed = JSON.parse(raw) as SharedServerTemplate[];
        if (!Array.isArray(parsed)) {
          setSharedTemplates([]);
          return;
        }
        const normalized = parsed
          .map((entry) => normalizeTemplate(entry))
          .filter((entry): entry is SharedServerTemplate => Boolean(entry));
        setSharedTemplates(normalized);
      } catch {
        setSharedTemplates([]);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: SharedServerTemplate[]) => {
    setSharedTemplates(next);
    await SecureStore.setItemAsync(STORAGE_SHARED_SERVER_TEMPLATES, JSON.stringify(next));
  }, []);

  const exportTemplatesFromServers = useCallback((servers: ServerProfile[]) => {
    const payload: ExportPayload = {
      version: 1,
      exported_at: new Date().toISOString(),
      source: "NovaRemote",
      templates: servers
        .map((server) => ({
          name: server.name,
          baseUrl: server.baseUrl,
          defaultCwd: server.defaultCwd,
          terminalBackend: server.terminalBackend,
          sshHost: server.sshHost,
          sshUser: server.sshUser,
          sshPort: sanitizeSshPort(server.sshPort),
        }))
        .filter((entry) => entry.baseUrl.trim()),
    };
    return JSON.stringify(payload, null, 2);
  }, []);

  const importTemplates = useCallback(
    async (payloadRaw: string): Promise<ImportSummary> => {
      const payload = payloadRaw.trim();
      if (!payload) {
        throw new Error("Template payload is required.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(payload);
      } catch {
        throw new Error("Template payload is not valid JSON.");
      }

      const source = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { templates?: unknown }).templates)
          ? (parsed as { templates: unknown[] }).templates
          : null;

      if (!source) {
        throw new Error("Template payload must be an array or object with templates array.");
      }

      const incoming = source
        .map((entry) => (entry && typeof entry === "object" ? normalizeTemplate(entry as Partial<SharedServerTemplate>) : null))
        .filter((entry): entry is SharedServerTemplate => Boolean(entry));

      if (incoming.length === 0) {
        throw new Error("No valid templates found in payload.");
      }

      const byId = new Map<string, SharedServerTemplate>();
      const fingerprints = new Set<string>();

      sharedTemplates.forEach((template) => {
        byId.set(template.id, template);
        fingerprints.add(templateFingerprint(template));
      });

      let skipped = 0;
      incoming.forEach((template) => {
        const fingerprint = templateFingerprint(template);
        if (!byId.has(template.id) && fingerprints.has(fingerprint)) {
          skipped += 1;
          return;
        }
        byId.set(template.id, template);
        fingerprints.add(fingerprint);
      });

      const next = Array.from(byId.values()).sort((a, b) => b.importedAt.localeCompare(a.importedAt));
      await persist(next);
      return {
        imported: incoming.length - skipped,
        skipped,
        total: next.length,
      };
    },
    [persist, sharedTemplates]
  );

  const deleteTemplate = useCallback(
    async (id: string) => {
      const next = sharedTemplates.filter((template) => template.id !== id);
      await persist(next);
    },
    [persist, sharedTemplates]
  );

  return {
    sharedTemplates,
    exportTemplatesFromServers,
    importTemplates,
    deleteTemplate,
  };
}

import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_SNIPPETS, makeId } from "../constants";
import { Snippet, TerminalSendMode } from "../types";

type SnippetImportSummary = {
  imported: number;
  skipped: number;
  total: number;
};

function normalizeSnippet(raw: Partial<Snippet>): Snippet | null {
  const name = (raw.name || "").trim();
  const command = typeof raw.command === "string" ? raw.command : "";
  if (!name || !command.trim()) {
    return null;
  }
  const mode: TerminalSendMode = raw.mode === "ai" ? "ai" : "shell";
  return {
    id: raw.id || makeId(),
    name,
    command,
    mode,
    serverId: raw.serverId?.trim() || undefined,
  };
}

export function useSnippets() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);

  useEffect(() => {
    let mounted = true;

    async function load() {
      const raw = await SecureStore.getItemAsync(STORAGE_SNIPPETS);
      if (!mounted) {
        return;
      }

      if (!raw) {
        setSnippets([]);
        return;
      }

      try {
        const parsed = JSON.parse(raw) as Snippet[];
        setSnippets(Array.isArray(parsed) ? parsed : []);
      } catch {
        setSnippets([]);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const persist = useCallback(async (next: Snippet[]) => {
    setSnippets(next);
    await SecureStore.setItemAsync(STORAGE_SNIPPETS, JSON.stringify(next));
  }, []);

  const upsertSnippet = useCallback(
    async (input: Omit<Snippet, "id"> & { id?: string }) => {
      const nextSnippet: Snippet = {
        id: input.id || makeId(),
        name: input.name.trim(),
        command: input.command,
        serverId: input.serverId || undefined,
        mode: input.mode,
      };

      const next = input.id
        ? snippets.map((snippet) => (snippet.id === input.id ? nextSnippet : snippet))
        : [nextSnippet, ...snippets];

      await persist(next);
    },
    [persist, snippets]
  );

  const deleteSnippet = useCallback(
    async (id: string) => {
      const next = snippets.filter((snippet) => snippet.id !== id);
      await persist(next);
    },
    [persist, snippets]
  );

  const snippetsFor = useCallback(
    (serverId: string | null, mode?: TerminalSendMode) => {
      return snippets.filter((snippet) => {
        const matchesServer = !snippet.serverId || (serverId ? snippet.serverId === serverId : false);
        const matchesMode = mode ? snippet.mode === mode : true;
        return matchesServer && matchesMode;
      });
    },
    [snippets]
  );

  const snippetModes = useMemo(() => {
    const modes = new Set<TerminalSendMode>();
    snippets.forEach((snippet) => modes.add(snippet.mode));
    return Array.from(modes);
  }, [snippets]);

  const exportSnippets = useCallback(
    (options?: { serverId?: string | null; includeGlobal?: boolean }) => {
      const includeGlobal = options?.includeGlobal ?? true;
      const scopedServerId = options?.serverId || null;
      const scoped = snippets.filter((snippet) => {
        if (!scopedServerId) {
          return true;
        }
        if (snippet.serverId === scopedServerId) {
          return true;
        }
        return includeGlobal && !snippet.serverId;
      });
      return JSON.stringify(
        {
          version: 1,
          exported_at: new Date().toISOString(),
          server_scope: scopedServerId || "all",
          snippets: scoped,
        },
        null,
        2
      );
    },
    [snippets]
  );

  const importSnippets = useCallback(
    async (payload: string): Promise<SnippetImportSummary> => {
      const raw = payload.trim();
      if (!raw) {
        throw new Error("Paste snippet JSON to import.");
      }

      let parsed: unknown;
      try {
        parsed = JSON.parse(raw);
      } catch {
        throw new Error("Snippet import payload is not valid JSON.");
      }

      const source = Array.isArray(parsed)
        ? parsed
        : parsed && typeof parsed === "object" && Array.isArray((parsed as { snippets?: unknown }).snippets)
          ? (parsed as { snippets: unknown[] }).snippets
          : null;

      if (!source) {
        throw new Error("Snippet import payload must be an array or an object with a snippets array.");
      }

      const incoming = source
        .map((entry) => (entry && typeof entry === "object" ? normalizeSnippet(entry as Partial<Snippet>) : null))
        .filter((entry): entry is Snippet => Boolean(entry));

      if (incoming.length === 0) {
        throw new Error("No valid snippets were found in the import payload.");
      }

      const nextById = new Map<string, Snippet>();
      snippets.forEach((snippet) => {
        nextById.set(snippet.id, snippet);
      });

      let skipped = 0;
      incoming.forEach((snippet) => {
        const hasExisting = nextById.has(snippet.id);
        const duplicateByBody = Array.from(nextById.values()).some(
          (entry) =>
            entry.id !== snippet.id &&
            entry.name === snippet.name &&
            entry.command === snippet.command &&
            (entry.serverId || "") === (snippet.serverId || "") &&
            entry.mode === snippet.mode
        );
        if (!hasExisting && duplicateByBody) {
          skipped += 1;
          return;
        }
        nextById.set(snippet.id, snippet);
      });

      const next = Array.from(nextById.values());
      await persist(next);
      return {
        imported: incoming.length - skipped,
        skipped,
        total: next.length,
      };
    },
    [persist, snippets]
  );

  return {
    snippets,
    snippetModes,
    upsertSnippet,
    deleteSnippet,
    snippetsFor,
    exportSnippets,
    importSnippets,
  };
}

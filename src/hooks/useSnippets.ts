import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useMemo, useState } from "react";

import { STORAGE_SNIPPETS, makeId } from "../constants";
import { Snippet, TerminalSendMode } from "../types";

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

  return {
    snippets,
    snippetModes,
    upsertSnippet,
    deleteSnippet,
    snippetsFor,
  };
}

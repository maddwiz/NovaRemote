import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { apiRequest } from "../api/client";
import { ServerProfile, RemoteFileEntry } from "../types";

type FilesListResponse = {
  path: string;
  entries: RemoteFileEntry[];
};

type FileReadResponse = {
  path: string;
  content: string;
};

type FileTailResponse = {
  path: string;
  lines: number;
  content: string;
};

type UseFilesBrowserArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

function parentPath(path: string): string {
  const clean = path.trim().replace(/\/+$/, "");
  if (!clean || clean === "/") {
    return "/";
  }
  const index = clean.lastIndexOf("/");
  if (index <= 0) {
    return "/";
  }
  return clean.slice(0, index);
}

export function useFilesBrowser({ activeServer, connected }: UseFilesBrowserArgs) {
  const [currentPath, setCurrentPath] = useState<string>("");
  const [includeHidden, setIncludeHidden] = useState<boolean>(false);
  const [entries, setEntries] = useState<RemoteFileEntry[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedContent, setSelectedContent] = useState<string>("");
  const [tailLines, setTailLines] = useState<string>("200");
  const currentPathRef = useRef<string>("");

  useEffect(() => {
    currentPathRef.current = currentPath;
  }, [currentPath]);

  useEffect(() => {
    setCurrentPath(activeServer?.defaultCwd || "");
    setEntries([]);
    setSelectedFilePath(null);
    setSelectedContent("");
  }, [activeServer?.id]);

  const listDirectory = useCallback(
    async (pathOverride?: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const targetPath = (pathOverride ?? currentPathRef.current).trim();
      const query = new URLSearchParams();
      if (targetPath) {
        query.set("path", targetPath);
      }
      if (includeHidden) {
        query.set("hidden", "true");
      }

      const suffix = query.toString() ? `?${query.toString()}` : "";
      const data = await apiRequest<FilesListResponse>(activeServer.baseUrl, activeServer.token, `/files/list${suffix}`);
      setCurrentPath(data.path);
      setEntries(data.entries || []);
      return data;
    },
    [activeServer, connected, includeHidden]
  );

  const readFile = useCallback(
    async (filePath: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }
      const data = await apiRequest<FileReadResponse>(
        activeServer.baseUrl,
        activeServer.token,
        `/files/read?path=${encodeURIComponent(filePath)}`
      );
      setSelectedFilePath(data.path);
      setSelectedContent(data.content || "");
      return data;
    },
    [activeServer, connected]
  );

  const tailFile = useCallback(
    async (filePath: string, linesOverride?: number) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const lines = Number.isFinite(linesOverride)
        ? Math.max(1, Math.min(linesOverride || 200, 5000))
        : Math.max(1, Math.min(Number.parseInt(tailLines, 10) || 200, 5000));

      const data = await apiRequest<FileTailResponse>(
        activeServer.baseUrl,
        activeServer.token,
        `/files/tail?path=${encodeURIComponent(filePath)}&lines=${lines}`
      );
      setSelectedFilePath(data.path);
      setSelectedContent(data.content || "");
      return data;
    },
    [activeServer, connected, tailLines]
  );

  const openEntry = useCallback(
    async (entry: RemoteFileEntry) => {
      if (entry.is_dir) {
        await listDirectory(entry.path);
        return;
      }
      await readFile(entry.path);
    },
    [listDirectory, readFile]
  );

  const goUp = useCallback(async () => {
    const nextPath = parentPath(currentPath || "/");
    await listDirectory(nextPath);
  }, [currentPath, listDirectory]);

  const selectedEntry = useMemo(
    () => (selectedFilePath ? entries.find((entry) => entry.path === selectedFilePath) ?? null : null),
    [entries, selectedFilePath]
  );

  return {
    currentPath,
    setCurrentPath,
    includeHidden,
    setIncludeHidden,
    entries,
    selectedFilePath,
    selectedEntry,
    selectedContent,
    tailLines,
    setTailLines,
    listDirectory,
    readFile,
    tailFile,
    openEntry,
    goUp,
  };
}

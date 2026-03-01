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

type FileWriteResponse = {
  ok?: boolean;
  path?: string;
  bytes?: number;
};

type UseFilesBrowserArgs = {
  activeServer: ServerProfile | null;
  connected: boolean;
};

const MAX_FILE_WRITE_BYTES = 1024 * 1024;

function contentByteLength(value: string): number {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(value).length;
  }
  return value.length;
}

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
  const [busy, setBusy] = useState<boolean>(false);
  const [busyLabel, setBusyLabel] = useState<string>("");
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
      setBusy(true);
      setBusyLabel("Listing directory...");

      const targetPath = (pathOverride ?? currentPathRef.current).trim();
      const query = new URLSearchParams();
      if (targetPath) {
        query.set("path", targetPath);
      }
      if (includeHidden) {
        query.set("hidden", "true");
      }

      const suffix = query.toString() ? `?${query.toString()}` : "";
      try {
        const data = await apiRequest<FilesListResponse>(activeServer.baseUrl, activeServer.token, `/files/list${suffix}`);
        setCurrentPath(data.path);
        setEntries(data.entries || []);
        return data;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [activeServer, connected, includeHidden]
  );

  const readFile = useCallback(
    async (filePath: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }
      setBusy(true);
      setBusyLabel("Reading file...");
      try {
        const data = await apiRequest<FileReadResponse>(
          activeServer.baseUrl,
          activeServer.token,
          `/files/read?path=${encodeURIComponent(filePath)}`
        );
        setSelectedFilePath(data.path);
        setSelectedContent(data.content || "");
        return data;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [activeServer, connected]
  );

  const tailFile = useCallback(
    async (filePath: string, linesOverride?: number) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }
      setBusy(true);
      setBusyLabel("Tailing file...");

      const lines = Number.isFinite(linesOverride)
        ? Math.max(1, Math.min(linesOverride || 200, 5000))
        : Math.max(1, Math.min(Number.parseInt(tailLines, 10) || 200, 5000));

      try {
        const data = await apiRequest<FileTailResponse>(
          activeServer.baseUrl,
          activeServer.token,
          `/files/tail?path=${encodeURIComponent(filePath)}&lines=${lines}`
        );
        setSelectedFilePath(data.path);
        setSelectedContent(data.content || "");
        return data;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [activeServer, connected, tailLines]
  );

  const writeFile = useCallback(
    async (filePath: string, content: string) => {
      if (!activeServer || !connected) {
        throw new Error("Connect to a server first.");
      }

      const targetPath = filePath.trim();
      if (!targetPath) {
        throw new Error("File path is required.");
      }
      const byteSize = contentByteLength(content);
      if (byteSize > MAX_FILE_WRITE_BYTES) {
        throw new Error(
          `File content is too large (${Math.round(byteSize / 1024)} KB). Max supported write size is ${Math.round(
            MAX_FILE_WRITE_BYTES / 1024
          )} KB.`
        );
      }

      setBusy(true);
      setBusyLabel("Saving file...");
      try {
        const data = await apiRequest<FileWriteResponse>(activeServer.baseUrl, activeServer.token, "/files/write", {
          method: "POST",
          body: JSON.stringify({
            path: targetPath,
            content,
          }),
        });
        setSelectedFilePath(data.path || targetPath);
        setSelectedContent(content);
        return data;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.startsWith("404")) {
          throw new Error("This server does not expose /files/write yet.");
        }
        throw error;
      } finally {
        setBusy(false);
        setBusyLabel("");
      }
    },
    [activeServer, connected]
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
    setSelectedFilePath,
    setSelectedContent,
    tailLines,
    setTailLines,
    busy,
    busyLabel,
    listDirectory,
    readFile,
    tailFile,
    writeFile,
    openEntry,
    goUp,
  };
}

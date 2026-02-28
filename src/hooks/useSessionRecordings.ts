import { useCallback, useEffect, useRef, useState } from "react";

import { SessionRecording } from "../types";

type UseSessionRecordingsArgs = {
  allSessions: string[];
  tails: Record<string, string>;
  onToggle?: () => void;
};

export function useSessionRecordings({ allSessions, tails, onToggle }: UseSessionRecordingsArgs) {
  const [recordings, setRecordings] = useState<Record<string, SessionRecording>>({});
  const recordingTailRef = useRef<Record<string, string>>({});

  const toggleRecording = useCallback(
    (session: string) => {
      const now = Date.now();
      setRecordings((prev) => {
        const current = prev[session];
        if (current?.active) {
          return {
            ...prev,
            [session]: {
              ...current,
              active: false,
              stoppedAt: now,
            },
          };
        }

        recordingTailRef.current[session] = tails[session] || "";
        return {
          ...prev,
          [session]: {
            session,
            active: true,
            startedAt: now,
            stoppedAt: null,
            chunks: [],
          },
        };
      });
      onToggle?.();
    },
    [onToggle, tails]
  );

  const deleteRecording = useCallback((session: string) => {
    setRecordings((prev) => {
      const next = { ...prev };
      delete next[session];
      return next;
    });
  }, []);

  useEffect(() => {
    const available = new Set(allSessions);
    Object.keys(recordingTailRef.current).forEach((session) => {
      if (!available.has(session)) {
        delete recordingTailRef.current[session];
      }
    });
  }, [allSessions]);

  useEffect(() => {
    setRecordings((prev) => {
      const next: Record<string, SessionRecording> = {};
      allSessions.forEach((session) => {
        if (prev[session]) {
          next[session] = prev[session];
        }
      });
      return next;
    });
  }, [allSessions]);

  useEffect(() => {
    setRecordings((prev) => {
      let changed = false;
      const next = { ...prev };

      allSessions.forEach((session) => {
        const latestTail = tails[session] || "";
        const priorTail = recordingTailRef.current[session] ?? "";
        if (latestTail === priorTail) {
          return;
        }

        const recording = next[session];
        if (recording?.active) {
          const delta = latestTail.startsWith(priorTail) ? latestTail.slice(priorTail.length) : latestTail;
          if (delta) {
            next[session] = {
              ...recording,
              chunks: [
                ...recording.chunks,
                {
                  atMs: Math.max(0, Date.now() - recording.startedAt),
                  text: delta,
                },
              ],
            };
            changed = true;
          }
        }
        recordingTailRef.current[session] = latestTail;
      });

      return changed ? next : prev;
    });
  }, [allSessions, tails]);

  return {
    recordings,
    toggleRecording,
    deleteRecording,
  };
}


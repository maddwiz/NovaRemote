import * as Haptics from "expo-haptics";
import { Share } from "react-native";

import { apiRequest } from "../api/client";
import { TerminalsViewModel } from "../context/AppContext";
import { DEFAULT_SPECTATE_TTL_SECONDS, FREE_SESSION_LIMIT, isLikelyAiSession } from "../constants";
import { ProcessSignal } from "../types";

export function useTerminalsViewModel(args: Record<string, unknown>): TerminalsViewModel {
  const {
    activeServer,
    connected,
    servers,
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    streamLive,
    connectionMeta,
    sendModes,
    sessionAiEngine,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    startAiEngine,
    capabilitiesLoading,
    health,
    capabilities,
    supportedFeatures,
    sysStats,
    activeProfile,
    localAiSessions,
    commandHistory,
    historyCount,
    sessionAliases,
    sessionTags,
    allTags,
    tagFilter,
    pinnedSessions,
    isPro,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetBusy,
    fleetWaitMs,
    shellRunWaitMs,
    fleetResults,
    processes,
    processesBusy,
    sessionPresence,
    sessionReadOnly,
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchRules,
    watchAlertHistoryBySession,
    terminalTheme,
    commandQueue,
    recordings,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    voiceMeteringDb,
    setPaywallVisible,
    setTagFilter,
    setStartCwd,
    setStartPrompt,
    setStartOpenOnMac,
    setStartKind,
    setStartAiEngine,
    runWithStatus,
    refreshCapabilities,
    refreshSessions,
    setRoute,
    openSshFallback,
    createLocalAiSession,
    setSessionAiEngine,
    sendViaExternalLlm,
    track,
    requestDangerApproval,
    handleStartSession,
    toggleSessionVisible,
    setStatus,
    isLocalSession,
    setSessionMode,
    handleOpenOnMac,
    fetchTail,
    createSpectateLink,
    terminalApiBasePath,
    setShareConfig,
    setFocusedSession,
    handleStop,
    removeOpenSession,
    closeStream,
    recallPrev,
    setDrafts,
    recallNext,
    setTagsForSession,
    parseCommaTags,
    setAliasForSession,
    inferSessionAlias,
    adaptCommandForBackend,
    sendControlToSession,
    setError,
    shouldRouteToExternalAi,
    queueSessionCommand,
    handleSend,
    addCommand,
    togglePinnedSession,
    setFleetCommand,
    setFleetCwd,
    setFleetTargets,
    setFleetWaitMs,
    setShellRunWaitMsInput,
    refreshProcesses,
    refreshSessionPresence,
    setSessionReadOnlyValue,
    requestShellSuggestions,
    explainSessionError,
    suggestSessionErrorFixes,
    setWatchEnabled,
    setWatchPattern,
    clearWatchAlerts,
    setTerminalPreset,
    setTerminalFontFamily,
    setTerminalFontSize,
    setTerminalBackgroundOpacity,
    flushSessionQueue,
    removeQueuedCommand,
    toggleRecording,
    openPlayback,
    deleteRecordingWithPlaybackCleanup,
    setGlassesEnabled,
    setGlassesBrand,
    setGlassesTextScale,
    setGlassesVoiceAutoSend,
    setGlassesVoiceLoop,
    setGlassesWakePhraseEnabled,
    setGlassesWakePhrase,
    setGlassesMinimalMode,
    setGlassesVadEnabled,
    setGlassesVadSilenceMs,
    setGlassesVadSensitivityDb,
    setGlassesLoopCaptureMs,
    setGlassesHeadsetPttEnabled,
    voicePermissionStatus,
    requestVoicePermission,
    startVoiceCapture,
    stopVoiceCaptureIntoSession,
    sendVoiceTranscriptToSession,
    runFleetCommand,
  } = args as any;

  const terminalsViewModel: TerminalsViewModel = {
    activeServer,
    connected,
    servers,
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    streamLive,
    connectionMeta,
    sendModes,
    sessionAiEngine,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    startAiEngine,
    capabilitiesLoading,
    health,
    capabilities,
    supportedFeatures,
    sysStats,
    hasExternalLlm: Boolean(activeProfile),
    localAiSessions,
    commandHistory,
    historyCount,
    sessionAliases,
    sessionTags,
    allTags,
    tagFilter,
    pinnedSessions,
    isPro,
    fleetCommand,
    fleetCwd,
    fleetTargets,
    fleetBusy,
    fleetWaitMs,
    shellRunWaitMs,
    fleetResults,
    processes,
    processesBusy,
    sessionPresence,
    sessionReadOnly,
    suggestionsBySession,
    suggestionBusyBySession,
    errorHintsBySession,
    triageBusyBySession,
    triageExplanationBySession,
    triageFixesBySession,
    watchRules,
    watchAlertHistoryBySession,
    terminalTheme,
    commandQueue,
    recordings,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    voiceMeteringDb,
    onShowPaywall: () => setPaywallVisible(true),
    onSetTagFilter: setTagFilter,
    onSetStartCwd: setStartCwd,
    onSetStartPrompt: setStartPrompt,
    onSetStartOpenOnMac: setStartOpenOnMac,
    onSetStartKind: setStartKind,
    onSetStartAiEngine: setStartAiEngine,
    onRefreshCapabilities: () => {
      void runWithStatus("Rechecking server features", async () => {
        await refreshCapabilities(true);
      });
    },
    onRefreshSessions: () => {
      void runWithStatus("Refreshing sessions", async () => {
        await refreshSessions();
      });
    },
    onOpenServers: () => setRoute("servers"),
    onOpenSshFallback: () => {
      void runWithStatus("Opening SSH fallback", async () => {
        await openSshFallback(activeServer);
      });
    },
    onStartSession: () => {
      void runWithStatus("Starting session", async () => {
        if (!isPro && openSessions.length >= FREE_SESSION_LIMIT) {
          setPaywallVisible(true);
          return;
        }

        if (startKind === "ai") {
          if (startAiEngine === "server" && !capabilities.codex) {
            throw new Error("Server AI engine is not available on the active server.");
          }
          const shouldStartExternal = startAiEngine === "external" || (startAiEngine === "auto" && !capabilities.codex);
          if (shouldStartExternal) {
            if (!activeProfile) {
              throw new Error("No active external LLM profile selected.");
            }
            const localSession = createLocalAiSession(startPrompt.trim());
            setSessionAiEngine((prev: any) => ({ ...prev, [localSession]: "external" }));
            if (startPrompt.trim()) {
              await sendViaExternalLlm(localSession, startPrompt);
              setStartPrompt("");
            }
            track("session_started", { kind: "ai", engine: "external", local: true });
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
        }

        if (startKind === "shell" && !capabilities.terminal) {
          throw new Error("Active server does not support terminal shell sessions.");
        }

        if (startKind === "shell" && startPrompt.trim()) {
          const approved = await requestDangerApproval(startPrompt, "Initial shell command");
          if (!approved) {
            return;
          }
        }

        const session = await handleStartSession();
        if (startKind === "ai") {
          setSessionAiEngine((prev: any) => ({
            ...prev,
            [session]: startAiEngine === "server" ? "server" : "auto",
          }));
        }
        track("session_started", {
          kind: startKind,
          engine: startKind === "ai" ? startAiEngine : "shell",
          local: false,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
    },
    onToggleSessionVisible: (session) => {
      if (!isPro && !openSessions.includes(session) && openSessions.length >= FREE_SESSION_LIMIT) {
        setPaywallVisible(true);
        return;
      }
      void Haptics.selectionAsync();
      toggleSessionVisible(session);
    },
    onSetSessionMode: (session, mode) => {
      if (mode === "ai" && !capabilities.codex && !activeProfile) {
        setStatus({ text: "No server AI or external LLM is configured.", error: true });
        return;
      }
      if (mode === "shell" && isLocalSession(session)) {
        setStatus({ text: "Local LLM sessions only support AI mode.", error: true });
        return;
      }
      if (mode === "shell" && !capabilities.terminal) {
        setStatus({ text: "Active server does not support terminal shell mode.", error: true });
        return;
      }
      setSessionMode(session, mode);
    },
    onSetSessionAiEngine: (session, engine) => {
      if (engine === "server" && !capabilities.codex) {
        setStatus({ text: "Server AI is unavailable for this server.", error: true });
        return;
      }
      if (engine === "external" && !activeProfile) {
        setStatus({ text: "No external LLM profile is configured.", error: true });
        return;
      }
      setSessionAiEngine((prev: any) => ({ ...prev, [session]: engine }));
    },
    onOpenOnMac: (session) => {
      void runWithStatus(`Opening ${session} on Mac`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions are not attached to a server terminal.");
        }
        if (!capabilities.macAttach) {
          throw new Error("Active server does not support mac attach.");
        }
        await handleOpenOnMac(session);
      });
    },
    onSyncSession: (session) => {
      void runWithStatus(`Syncing ${session}`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions are already in sync.");
        }
        await fetchTail(session, true);
      });
    },
    onShareLiveSession: (session) => {
      void runWithStatus(`Creating live share link for ${session}`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions cannot be shared as live spectator links.");
        }
        if (!activeServer) {
          throw new Error("No active server selected.");
        }
        if (!capabilities.spectate) {
          throw new Error("Active server does not support session spectator links.");
        }

        const result = await createSpectateLink(activeServer, terminalApiBasePath, session);
        const expiresLabel = result.expiresAt
          ? `Read-only browser view. Expires ${new Date(result.expiresAt).toLocaleString()}.`
          : "Read-only browser view. Server controls token expiry.";

        setShareConfig({
          title: sessionAliases[session]?.trim() || session,
          link: result.url,
          heading: "Share Live Session",
          description: expiresLabel,
          shareButtonLabel: "Share Spectator Link",
        });

        track("session_spectate_link_created", {
          has_expiry: Boolean(result.expiresAt),
          ttl_seconds: DEFAULT_SPECTATE_TTL_SECONDS,
        });
      });
    },
    onExportSession: (session) => {
      void runWithStatus(`Exporting ${session}`, async () => {
        const payload = {
          exported_at: new Date().toISOString(),
          server: activeServer?.name || "",
          session,
          alias: sessionAliases[session] || "",
          mode: sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell"),
          commands: commandHistory[session] || [],
          output: tails[session] || "",
          recording: recordings[session]
            ? {
                active: recordings[session].active,
                started_at_ms: recordings[session].startedAt,
                stopped_at_ms: recordings[session].stoppedAt,
                chunks: recordings[session].chunks,
              }
            : null,
        };

        await Share.share({
          title: `NovaRemote ${session} export`,
          message: JSON.stringify(payload, null, 2),
        });
      });
    },
    onFocusSession: setFocusedSession,
    onStopSession: (session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void runWithStatus(`Stopping ${session}`, async () => {
        if (isLocalSession(session)) {
          throw new Error("Local LLM sessions do not support Ctrl-C.");
        }
        if (sessionReadOnly[session]) {
          throw new Error(`${session} is read-only. Disable read-only before sending Ctrl-C.`);
        }
        await handleStop(session);
      });
    },
    onHideSession: (session) => {
      removeOpenSession(session);
      closeStream(session);
    },
    onHistoryPrev: (session) => {
      const prev = recallPrev(session);
      if (prev !== null) {
        setDrafts((existing: any) => ({ ...existing, [session]: prev }));
      }
    },
    onHistoryNext: (session) => {
      const next = recallNext(session);
      if (next !== null) {
        setDrafts((existing: any) => ({ ...existing, [session]: next }));
      }
    },
    onSetTags: (session, raw) => {
      void setTagsForSession(session, parseCommaTags(raw));
    },
    onSetSessionAlias: (session, alias) => {
      void setAliasForSession(session, alias);
    },
    onAutoNameSession: (session) => {
      const guess = inferSessionAlias(session, tails[session] || "", commandHistory[session] || []);
      if (!guess) {
        setStatus({ text: `No obvious alias detected for ${session}.`, error: false });
        return;
      }
      void setAliasForSession(session, guess);
      setStatus({ text: `${session} renamed to ${guess}.`, error: false });
    },
    onSetDraft: (session, value) => {
      setDrafts((prev: any) => ({
        ...prev,
        [session]: value,
      }));
    },
    onAdaptDraftForBackend: (session) => {
      const source = drafts[session] || "";
      const adapted = adaptCommandForBackend(source, activeServer?.terminalBackend);
      if (adapted === source) {
        setStatus({ text: "No backend adaptation needed.", error: false });
        return;
      }
      setDrafts((prev: any) => ({ ...prev, [session]: adapted }));
      setStatus({ text: `Adapted command for ${activeServer?.terminalBackend || "auto"} backend.`, error: false });
    },
    onSendControlChar: (session, char) => {
      void Haptics.selectionAsync();
      void sendControlToSession(session, char).catch((error: unknown) => {
        setError(error);
      });
    },
    onSend: (session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void runWithStatus(`Sending to ${session}`, async () => {
        const draft = (drafts[session] || "").trim();
        const mode = sendModes[session] || (isLikelyAiSession(session) ? "ai" : "shell");
        if (sessionReadOnly[session]) {
          throw new Error(`${session} is read-only. Disable read-only to send commands.`);
        }
        if (mode === "ai" && shouldRouteToExternalAi(session)) {
          const sent = await sendViaExternalLlm(session, draft);
          if (sent) {
            await addCommand(session, sent);
          }
          return;
        }
        if (mode === "shell") {
          const approved = await requestDangerApproval(draft, `Send to ${session}`);
          if (!approved) {
            return;
          }
        }

        if (!connected && !isLocalSession(session)) {
          queueSessionCommand(session, draft, mode);
          return;
        }

        const sent = await handleSend(session);
        if (sent) {
          await addCommand(session, sent);
          track("command_sent", { mode, session_kind: isLocalSession(session) ? "local" : "remote" });
        }
      });
    },
    onClearDraft: (session) => {
      setDrafts((prev: any) => ({ ...prev, [session]: "" }));
    },
    onTogglePinSession: (session) => {
      void togglePinnedSession(session);
    },
    onSetFleetCommand: setFleetCommand,
    onSetFleetCwd: setFleetCwd,
    onToggleFleetTarget: (serverId) => {
      setFleetTargets((prev: any[]) => (prev.includes(serverId) ? prev.filter((id: any) => id !== serverId) : [...prev, serverId]));
    },
    onSetFleetWaitMs: setFleetWaitMs,
    onSetShellRunWaitMs: setShellRunWaitMsInput,
    onRefreshProcesses: () => {
      void runWithStatus("Refreshing processes", async () => {
        await refreshProcesses();
      });
    },
    onKillProcess: (pid, signal: ProcessSignal = "TERM") => {
      void runWithStatus(`Sending ${signal} to PID ${pid}`, async () => {
        if (!activeServer || !connected || !capabilities.processes) {
          throw new Error("Process manager is unavailable on the active server.");
        }
        await apiRequest(activeServer.baseUrl, activeServer.token, "/proc/kill", {
          method: "POST",
          body: JSON.stringify({ pid, signal }),
        });
        await refreshProcesses();
      });
    },
    onKillProcesses: (pids, signal) => {
      void runWithStatus(`Sending ${signal} to ${pids.length} process(es)`, async () => {
        if (!activeServer || !connected || !capabilities.processes) {
          throw new Error("Process manager is unavailable on the active server.");
        }
        const uniquePids = Array.from(new Set(pids.filter((pid) => Number.isFinite(pid) && pid > 0)));
        if (uniquePids.length === 0) {
          return;
        }
        await Promise.all(
          uniquePids.map((pid) =>
            apiRequest(activeServer.baseUrl, activeServer.token, "/proc/kill", {
              method: "POST",
              body: JSON.stringify({ pid, signal }),
            })
          )
        );
        await refreshProcesses();
      });
    },
    onRefreshSessionPresence: (session) => {
      void runWithStatus(`Refreshing presence for ${session}`, async () => {
        await refreshSessionPresence(session, true);
      });
    },
    onSetSessionReadOnly: (session, value) => {
      setSessionReadOnlyValue(session, value);
    },
    onRequestSuggestions: (session) => {
      void runWithStatus(`Generating suggestions for ${session}`, async () => {
        await requestShellSuggestions(session);
      });
    },
    onUseSuggestion: (session, value) => {
      setDrafts((prev: any) => ({ ...prev, [session]: value }));
    },
    onExplainError: (session) => {
      void runWithStatus(`Explaining ${session} error`, async () => {
        await explainSessionError(session);
      });
    },
    onSuggestErrorFixes: (session) => {
      void runWithStatus(`Generating ${session} fixes`, async () => {
        await suggestSessionErrorFixes(session);
      });
    },
    onToggleWatch: (session, enabled) => {
      setWatchEnabled(session, enabled);
    },
    onSetWatchPattern: (session, pattern) => {
      setWatchPattern(session, pattern);
    },
    onClearWatchAlerts: (session) => {
      clearWatchAlerts(session);
    },
    onSetTerminalPreset: setTerminalPreset,
    onSetTerminalFontFamily: setTerminalFontFamily,
    onSetTerminalFontSize: setTerminalFontSize,
    onSetTerminalBackgroundOpacity: setTerminalBackgroundOpacity,
    onFlushQueue: (session) => {
      void runWithStatus(`Flushing queued commands for ${session}`, async () => {
        await flushSessionQueue(session, { includeFailed: true });
      });
    },
    onRemoveQueuedCommand: (session, index) => {
      removeQueuedCommand(session, index);
    },
    onToggleRecording: toggleRecording,
    onOpenPlayback: openPlayback,
    onDeleteRecording: deleteRecordingWithPlaybackCleanup,
    onSetGlassesEnabled: setGlassesEnabled,
    onSetGlassesBrand: setGlassesBrand,
    onSetGlassesTextScale: setGlassesTextScale,
    onSetGlassesVoiceAutoSend: setGlassesVoiceAutoSend,
    onSetGlassesVoiceLoop: setGlassesVoiceLoop,
    onSetGlassesWakePhraseEnabled: setGlassesWakePhraseEnabled,
    onSetGlassesWakePhrase: setGlassesWakePhrase,
    onSetGlassesMinimalMode: setGlassesMinimalMode,
    onSetGlassesVadEnabled: setGlassesVadEnabled,
    onSetGlassesVadSilenceMs: setGlassesVadSilenceMs,
    onSetGlassesVadSensitivityDb: setGlassesVadSensitivityDb,
    onSetGlassesLoopCaptureMs: setGlassesLoopCaptureMs,
    onSetGlassesHeadsetPttEnabled: setGlassesHeadsetPttEnabled,
    onOpenGlassesMode: () => {
      if (!glassesMode.enabled) {
        setGlassesEnabled(true);
      }
      if (voicePermissionStatus !== "granted") {
        setStatus({
          text: "Glasses voice mode needs microphone access. Please allow microphone permission.",
          error: false,
        });
        void requestVoicePermission();
      }
      setRoute("glasses");
    },
    onCloseGlassesMode: () => {
      setRoute("terminals");
    },
    onVoiceStartCapture: () => {
      void runWithStatus("Starting voice capture", async () => {
        await Haptics.selectionAsync();
        await startVoiceCapture();
      });
    },
    onVoiceStopCapture: (session) => {
      if (glassesMode.voiceLoop) {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        void stopVoiceCaptureIntoSession(session).then((ok: boolean) => {
          if (ok) {
            void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            return;
          }
          void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        });
        return;
      }
      void runWithStatus(`Transcribing voice for ${session}`, async () => {
        await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        await stopVoiceCaptureIntoSession(session);
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      });
    },
    onVoiceSendTranscript: (session) => {
      void runWithStatus(`Sending transcript to ${session}`, async () => {
        await sendVoiceTranscriptToSession(session);
      });
    },
    onRunFleet: () => {
      void runWithStatus("Running fleet command", async () => {
        const approved = await requestDangerApproval(fleetCommand, "Fleet execute");
        if (!approved) {
          return;
        }
        await runFleetCommand();
        track("fleet_run", { target_count: fleetTargets.length });
      });
    },
  };

  return terminalsViewModel;
}

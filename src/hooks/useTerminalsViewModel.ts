import * as Haptics from "expo-haptics";
import { Share } from "react-native";

import { apiRequest } from "../api/client";
import { TerminalsViewModel } from "../context/AppContext";
import { DEFAULT_SPECTATE_TTL_SECONDS, FREE_SESSION_LIMIT, isLikelyAiSession } from "../constants";
import { ProcessSignal, TerminalSendMode } from "../types";

function uniqueServerIds(serverIds: string[]): string[] {
  const seen = new Set<string>();
  const next: string[] = [];
  serverIds.forEach((value) => {
    const id = value.trim();
    if (!id || seen.has(id)) {
      return;
    }
    seen.add(id);
    next.push(id);
  });
  return next;
}

export function useTerminalsViewModel(args: Record<string, unknown>): TerminalsViewModel {
  const {
    activeServer,
    connected,
    focusedServerId,
    connections,
    unreadServers,
    connectedServerCount,
    totalActiveStreams,
    poolLifecyclePaused,
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
    refreshAllServers,
    setRoute,
    focusServer,
    reconnectServer,
    reconnectServers,
    reconnectAllServers,
    connectAllServers,
    disconnectAllServers,
    createSessionForServer,
    createAgentForServer,
    setAgentStatusForServer,
    setAgentGoalForServer,
    createAgentForServers,
    setAgentStatusForServers,
    setAgentGoalForServers,
    removeAgentForServer,
    removeAgentForServers,
    queueAgentCommandForServer,
    queueAgentCommandForServers,
    approveReadyAgentsForServer,
    denyAllPendingAgentsForServer,
    approveReadyAgentsForServers,
    denyAllPendingAgentsForServers,
    editServer,
    openSshFallback,
    createLocalAiSession,
    setSessionAiEngine,
    sendViaExternalLlm,
    track,
    recordAuditEvent,
    requestDangerApproval,
    handleStartSession,
    toggleSessionVisible,
    setStatus,
    isLocalSession,
    setSessionMode,
    handleOpenOnMac,
    openServerSessionOnMac,
    fetchTail,
    createSpectateLink,
    setShareConfig,
    setFocusedSession,
    handleStop,
    stopServerSession,
    removeOpenSession,
    closeStream,
    recallPrev,
    setDrafts,
    setServerSessionDraft,
    sendServerSessionDraft,
    sendServerSessionCommand,
    clearServerSessionDraft,
    sendServerSessionControlChar,
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
    stopVoiceCaptureIntoServerSession,
    sendVoiceTranscriptToSession,
    sendVoiceTranscriptToServerSession,
    runFleetCommand,
  } = args as any;

  const runApproveReadyAgentsForServer = async (serverId: string): Promise<string[]> => {
    if (typeof approveReadyAgentsForServer === "function") {
      const approved = await approveReadyAgentsForServer(serverId);
      return Array.isArray(approved) ? approved : [];
    }
    return [];
  };

  const runDenyAllPendingAgentsForServer = async (serverId: string): Promise<string[]> => {
    if (typeof denyAllPendingAgentsForServer === "function") {
      const denied = await denyAllPendingAgentsForServer(serverId);
      return Array.isArray(denied) ? denied : [];
    }
    return [];
  };

  const runApproveReadyAgentsForServers = async (serverIds: string[]): Promise<string[]> => {
    if (typeof approveReadyAgentsForServers === "function") {
      const approved = await approveReadyAgentsForServers(uniqueServerIds(serverIds));
      return Array.isArray(approved) ? approved : [];
    }
    const approved: string[] = [];
    for (const serverId of uniqueServerIds(serverIds)) {
      const next = await runApproveReadyAgentsForServer(serverId);
      approved.push(...next);
    }
    return approved;
  };

  const runDenyAllPendingAgentsForServers = async (serverIds: string[]): Promise<string[]> => {
    if (typeof denyAllPendingAgentsForServers === "function") {
      const denied = await denyAllPendingAgentsForServers(uniqueServerIds(serverIds));
      return Array.isArray(denied) ? denied : [];
    }
    const denied: string[] = [];
    for (const serverId of uniqueServerIds(serverIds)) {
      const next = await runDenyAllPendingAgentsForServer(serverId);
      denied.push(...next);
    }
    return denied;
  };

  const runCreateSession = async (serverId: string, kind: "ai" | "shell", prompt: string = ""): Promise<string> => {
    if (typeof createSessionForServer === "function") {
      const session = await createSessionForServer(serverId, kind, prompt);
      if (typeof session === "string" && session.trim()) {
        return session;
      }
    }
    throw new Error("Session creation is unavailable for the selected server.");
  };

  const runCreateAgentForServer = async (serverId: string, name: string): Promise<string[]> => {
    if (typeof createAgentForServer === "function") {
      const created = await createAgentForServer(serverId, name);
      return Array.isArray(created) ? created : [];
    }
    return [];
  };

  const runSetAgentStatusForServer = async (
    serverId: string,
    name: string,
    status: "idle" | "monitoring" | "executing" | "waiting_approval"
  ): Promise<string[]> => {
    if (typeof setAgentStatusForServer === "function") {
      const updated = await setAgentStatusForServer(serverId, name, status);
      return Array.isArray(updated) ? updated : [];
    }
    return [];
  };

  const runSetAgentGoalForServer = async (serverId: string, name: string, goal: string): Promise<string[]> => {
    if (typeof setAgentGoalForServer === "function") {
      const updated = await setAgentGoalForServer(serverId, name, goal);
      return Array.isArray(updated) ? updated : [];
    }
    return [];
  };

  const runCreateAgentForServers = async (serverIds: string[], name: string): Promise<string[]> => {
    const uniqueIds = uniqueServerIds(serverIds);
    if (typeof createAgentForServers === "function") {
      const created = await createAgentForServers(uniqueIds, name);
      return Array.isArray(created) ? created : [];
    }
    const created: string[] = [];
    for (const serverId of uniqueIds) {
      const next = await runCreateAgentForServer(serverId, name);
      created.push(...next);
    }
    return created;
  };

  const runSetAgentStatusForServers = async (
    serverIds: string[],
    name: string,
    status: "idle" | "monitoring" | "executing" | "waiting_approval"
  ): Promise<string[]> => {
    const uniqueIds = uniqueServerIds(serverIds);
    if (typeof setAgentStatusForServers === "function") {
      const updated = await setAgentStatusForServers(uniqueIds, name, status);
      return Array.isArray(updated) ? updated : [];
    }
    const updated: string[] = [];
    for (const serverId of uniqueIds) {
      const next = await runSetAgentStatusForServer(serverId, name, status);
      updated.push(...next);
    }
    return updated;
  };

  const runSetAgentGoalForServers = async (serverIds: string[], name: string, goal: string): Promise<string[]> => {
    const uniqueIds = uniqueServerIds(serverIds);
    if (typeof setAgentGoalForServers === "function") {
      const updated = await setAgentGoalForServers(uniqueIds, name, goal);
      return Array.isArray(updated) ? updated : [];
    }
    const updated: string[] = [];
    for (const serverId of uniqueIds) {
      const next = await runSetAgentGoalForServer(serverId, name, goal);
      updated.push(...next);
    }
    return updated;
  };

  const runRemoveAgentForServer = async (serverId: string, name: string): Promise<string[]> => {
    if (typeof removeAgentForServer === "function") {
      const removed = await removeAgentForServer(serverId, name);
      return Array.isArray(removed) ? removed : [];
    }
    return [];
  };

  const runRemoveAgentForServers = async (serverIds: string[], name: string): Promise<string[]> => {
    const uniqueIds = uniqueServerIds(serverIds);
    if (typeof removeAgentForServers === "function") {
      const removed = await removeAgentForServers(uniqueIds, name);
      return Array.isArray(removed) ? removed : [];
    }
    const removed: string[] = [];
    for (const serverId of uniqueIds) {
      const next = await runRemoveAgentForServer(serverId, name);
      removed.push(...next);
    }
    return removed;
  };

  const runQueueAgentCommandForServer = async (
    serverId: string,
    name: string,
    command: string
  ): Promise<string[]> => {
    if (typeof queueAgentCommandForServer === "function") {
      const queued = await queueAgentCommandForServer(serverId, name, command);
      return Array.isArray(queued) ? queued : [];
    }
    return [];
  };

  const runQueueAgentCommandForServers = async (
    serverIds: string[],
    name: string,
    command: string
  ): Promise<string[]> => {
    const uniqueIds = uniqueServerIds(serverIds);
    if (typeof queueAgentCommandForServers === "function") {
      const queued = await queueAgentCommandForServers(uniqueIds, name, command);
      return Array.isArray(queued) ? queued : [];
    }
    const queued: string[] = [];
    for (const serverId of uniqueIds) {
      const next = await runQueueAgentCommandForServer(serverId, name, command);
      queued.push(...next);
    }
    return queued;
  };

  const shareServerSessionLive = async (serverId: string, session: string) => {
    const targetConnection =
      connections && typeof (connections as Map<string, unknown>).get === "function"
        ? (connections as Map<string, any>).get(serverId)
        : null;
    if (!targetConnection) {
      throw new Error("Selected server is not available.");
    }
    if ((targetConnection.localAiSessions || []).includes(session)) {
      throw new Error("Local LLM sessions cannot be shared as live spectator links.");
    }
    if (!targetConnection.capabilities?.spectate) {
      throw new Error(`${targetConnection.server?.name || "Target server"} does not support session spectator links.`);
    }

    const rawResult = await createSpectateLink(targetConnection.server, targetConnection.terminalApiBasePath, session);
    const normalized =
      typeof rawResult === "string"
        ? { url: rawResult, expiresAt: null as string | null }
        : {
            url: typeof rawResult?.url === "string" ? rawResult.url : "",
            expiresAt: typeof rawResult?.expiresAt === "string" ? rawResult.expiresAt : null,
          };
    if (!normalized.url) {
      throw new Error("Unable to create a spectator link for this session.");
    }

    const sessionTitle = activeServer?.id === serverId ? sessionAliases[session]?.trim() || session : session;
    const expiresLabel = normalized.expiresAt
      ? `Read-only browser view. Expires ${new Date(normalized.expiresAt).toLocaleString()}.`
      : "Read-only browser view. Server controls token expiry.";

    setShareConfig({
      title: sessionTitle,
      link: normalized.url,
      heading: "Share Live Session",
      description: expiresLabel,
      shareButtonLabel: "Share Spectator Link",
    });

    track("session_spectate_link_created", {
      has_expiry: Boolean(normalized.expiresAt),
      ttl_seconds: DEFAULT_SPECTATE_TTL_SECONDS,
      server_id: serverId,
    });
  };

  const terminalsViewModel: TerminalsViewModel = {
    activeServer,
    connected,
    focusedServerId,
    connections,
    unreadServers,
    connectedServerCount,
    totalActiveStreams,
    poolLifecyclePaused,
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
    onRefreshAllServers: () => {
      void runWithStatus("Refreshing all servers", async () => {
        await refreshAllServers();
      });
    },
    onOpenServers: () => setRoute("servers"),
    onOpenAgents: () => setRoute("agents"),
    onFocusServer: focusServer,
    onCreateSession: runCreateSession,
    onReconnectServer: reconnectServer,
    onReconnectServers: reconnectServers,
    onReconnectAllServers: reconnectAllServers,
    onConnectAllServers: connectAllServers,
    onDisconnectAllServers: disconnectAllServers,
    onCreateAgentForServer: runCreateAgentForServer,
    onSetAgentStatusForServer: runSetAgentStatusForServer,
    onSetAgentGoalForServer: runSetAgentGoalForServer,
    onCreateAgentForServers: runCreateAgentForServers,
    onSetAgentStatusForServers: runSetAgentStatusForServers,
    onSetAgentGoalForServers: runSetAgentGoalForServers,
    onRemoveAgentForServer: runRemoveAgentForServer,
    onRemoveAgentForServers: runRemoveAgentForServers,
    onQueueAgentCommandForServer: runQueueAgentCommandForServer,
    onQueueAgentCommandForServers: runQueueAgentCommandForServers,
    onApproveReadyAgentsForServer: runApproveReadyAgentsForServer,
    onDenyAllPendingAgentsForServer: runDenyAllPendingAgentsForServer,
    onApproveReadyAgentsForServers: runApproveReadyAgentsForServers,
    onDenyAllPendingAgentsForServers: runDenyAllPendingAgentsForServers,
    onEditServer: editServer,
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
    onOpenServerSessionOnMac: (serverId, session) => {
      void runWithStatus(`Opening ${session} on Mac`, async () => {
        if (typeof openServerSessionOnMac === "function") {
          await openServerSessionOnMac(serverId, session);
          return;
        }
        if (activeServer?.id !== serverId) {
          throw new Error("Focus the target server before opening on Mac.");
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
        const targetServerId = focusedServerId || activeServer?.id || null;
        if (!targetServerId) {
          throw new Error("No active server selected.");
        }
        await shareServerSessionLive(targetServerId, session);
      });
    },
    onShareServerSessionLive: (serverId, session) => {
      void runWithStatus(`Creating live share link for ${session}`, async () => {
        await shareServerSessionLive(serverId, session);
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
    onStopServerSession: (serverId, session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
      void runWithStatus(`Stopping ${session}`, async () => {
        if (typeof stopServerSession === "function") {
          await stopServerSession(serverId, session);
          return;
        }
        if (activeServer?.id !== serverId) {
          throw new Error("Focus the target server before stopping sessions.");
        }
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
    onSetServerSessionDraft: (serverId, session, value) => {
      if (typeof setServerSessionDraft === "function") {
        setServerSessionDraft(serverId, session, value);
        return;
      }
      if (activeServer?.id !== serverId) {
        return;
      }
      setDrafts((prev: any) => ({ ...prev, [session]: value }));
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
    onSendServerSessionControlChar: (serverId, session, char) => {
      void Haptics.selectionAsync();
      if (typeof sendServerSessionControlChar === "function") {
        void sendServerSessionControlChar(serverId, session, char).catch((error: unknown) => {
          setError(error);
        });
        return;
      }
      if (activeServer?.id !== serverId) {
        setStatus({ text: "Focus the target server before sending control keys.", error: true });
        return;
      }
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
    onSendServerSessionDraft: (serverId, session) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      if (typeof sendServerSessionDraft === "function") {
        void runWithStatus(`Sending to ${session}`, async () => {
          const connection = connections.get(serverId);
          const mode = connection?.sendModes?.[session] || (isLikelyAiSession(session) ? "ai" : "shell");
          const draft = (connection?.drafts?.[session] || "").trim();
          if (mode === "shell") {
            const approved = await requestDangerApproval(draft, `Send to ${session}`);
            if (!approved) {
              return;
            }
          }
          await sendServerSessionDraft(serverId, session);
        });
        return;
      }
      if (activeServer?.id !== serverId) {
        setStatus({ text: "Focus the target server before sending.", error: true });
        return;
      }
      void runWithStatus(`Sending to ${session}`, async () => {
        const sent = await handleSend(session);
        if (sent) {
          await addCommand(session, sent);
        }
      });
    },
    onSendServerSessionCommand: (serverId, session, command, mode) => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      void runWithStatus(`Sending to ${session}`, async () => {
        const trimmed = command.trim();
        if (!trimmed) {
          return;
        }

        const connection = connections.get(serverId);
        const resolvedMode: TerminalSendMode =
          mode || connection?.sendModes?.[session] || (isLikelyAiSession(session) ? "ai" : "shell");

        if (resolvedMode === "shell") {
          const approved = await requestDangerApproval(trimmed, `Send to ${session}`);
          if (!approved) {
            return;
          }
        }

        if (typeof sendServerSessionCommand === "function") {
          await sendServerSessionCommand(serverId, session, trimmed, resolvedMode);
          return;
        }

        if (typeof setServerSessionDraft === "function") {
          setServerSessionDraft(serverId, session, trimmed);
        } else if (activeServer?.id === serverId) {
          setDrafts((prev: any) => ({ ...prev, [session]: trimmed }));
        }

        if (typeof sendServerSessionDraft === "function") {
          await sendServerSessionDraft(serverId, session);
          return;
        }

        if (activeServer?.id !== serverId) {
          throw new Error("Focus the target server before sending direct commands.");
        }
        const sent = await handleSend(session);
        if (sent) {
          await addCommand(session, sent);
        }
      });
    },
    onClearDraft: (session) => {
      setDrafts((prev: any) => ({ ...prev, [session]: "" }));
    },
    onClearServerSessionDraft: (serverId, session) => {
      if (typeof clearServerSessionDraft === "function") {
        clearServerSessionDraft(serverId, session);
        return;
      }
      if (activeServer?.id !== serverId) {
        return;
      }
      setDrafts((prev: any) => ({ ...prev, [session]: "" }));
    },
    onTogglePinSession: (session) => {
      void togglePinnedSession(session);
    },
    onSetFleetCommand: setFleetCommand,
    onSetFleetCwd: setFleetCwd,
    onSetFleetTargets: (serverIds) => {
      setFleetTargets(uniqueServerIds(serverIds));
    },
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
        if (activeServer.source === "team" && activeServer.permissionLevel === "viewer") {
          if (typeof recordAuditEvent === "function") {
            recordAuditEvent({
              action: "command_dangerous_denied",
              serverId: activeServer.id,
              serverName: activeServer.name,
              detail: `Process kill denied for viewer role (pid=${pid})`,
              approved: false,
            });
          }
          throw new Error(`${activeServer.name} is read-only for your viewer role.`);
        }
        await apiRequest(activeServer.baseUrl, activeServer.token, "/proc/kill", {
          method: "POST",
          body: JSON.stringify({ pid, signal }),
        });
        await refreshProcesses();
        if (typeof recordAuditEvent === "function") {
          recordAuditEvent({
            action: "process_killed",
            serverId: activeServer.id,
            serverName: activeServer.name,
            session: "",
            detail: `pid=${pid} signal=${signal}`,
          });
        }
      });
    },
    onKillProcesses: (pids, signal) => {
      void runWithStatus(`Sending ${signal} to ${pids.length} process(es)`, async () => {
        if (!activeServer || !connected || !capabilities.processes) {
          throw new Error("Process manager is unavailable on the active server.");
        }
        if (activeServer.source === "team" && activeServer.permissionLevel === "viewer") {
          if (typeof recordAuditEvent === "function") {
            recordAuditEvent({
              action: "command_dangerous_denied",
              serverId: activeServer.id,
              serverName: activeServer.name,
              detail: `Process kill denied for viewer role (count=${pids.length})`,
              approved: false,
            });
          }
          throw new Error(`${activeServer.name} is read-only for your viewer role.`);
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
        if (typeof recordAuditEvent === "function") {
          recordAuditEvent({
            action: "process_killed",
            serverId: activeServer.id,
            serverName: activeServer.name,
            session: "",
            detail: `pids=${uniquePids.join(",")} signal=${signal}`,
          });
        }
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
    onOpenVrCommandCenter: () => {
      setRoute("vr");
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
    onVoiceStopCaptureForServer: (serverId, session, options) => {
      if (typeof stopVoiceCaptureIntoServerSession === "function") {
        if (glassesMode.voiceLoop) {
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          void stopVoiceCaptureIntoServerSession(serverId, session, options).then((ok: boolean) => {
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
          await stopVoiceCaptureIntoServerSession(serverId, session, options);
          await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        });
        return;
      }
      if (activeServer?.id !== serverId) {
        setStatus({ text: "Focus the target server before transcribing voice.", error: true });
        return;
      }
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
    onVoiceSendTranscriptForServer: (serverId, session) => {
      if (typeof sendVoiceTranscriptToServerSession === "function") {
        void runWithStatus(`Sending transcript to ${session}`, async () => {
          await sendVoiceTranscriptToServerSession(serverId, session);
        });
        return;
      }
      if (activeServer?.id !== serverId) {
        setStatus({ text: "Focus the target server before sending transcript.", error: true });
        return;
      }
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

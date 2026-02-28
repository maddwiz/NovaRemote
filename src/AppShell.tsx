import { StatusBar } from "expo-status-bar";
import * as Linking from "expo-linking";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  AppState,
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";

import { apiRequest, normalizeBaseUrl } from "./api/client";
import { FullscreenTerminal } from "./components/FullscreenTerminal";
import { LockScreen } from "./components/LockScreen";
import { OnboardingModal } from "./components/OnboardingModal";
import { PaywallModal } from "./components/PaywallModal";
import { ShareServerModal } from "./components/ShareServerModal";
import { StatusPill } from "./components/StatusPill";
import { TabBar } from "./components/TabBar";
import { TutorialModal } from "./components/TutorialModal";
import {
  BRAND_LOGO,
  DEFAULT_CWD,
  FREE_SERVER_LIMIT,
  FREE_SESSION_LIMIT,
  POLL_INTERVAL_MS,
  isLikelyAiSession,
} from "./constants";
import { useBiometricLock } from "./hooks/useBiometricLock";
import { useCommandHistory } from "./hooks/useCommandHistory";
import { useConnectionHealth } from "./hooks/useConnectionHealth";
import { useNotifications } from "./hooks/useNotifications";
import { useOnboarding } from "./hooks/useOnboarding";
import { useRevenueCat } from "./hooks/useRevenueCat";
import { useServers } from "./hooks/useServers";
import { useSessionTags } from "./hooks/useSessionTags";
import { useServerCapabilities } from "./hooks/useServerCapabilities";
import { useSnippets } from "./hooks/useSnippets";
import { useTerminalSessions } from "./hooks/useTerminalSessions";
import { useTutorial } from "./hooks/useTutorial";
import { useWebSocket } from "./hooks/useWebSocket";
import { useFilesBrowser } from "./hooks/useFilesBrowser";
import { FilesScreen } from "./screens/FilesScreen";
import { ServersScreen } from "./screens/ServersScreen";
import { SnippetsScreen } from "./screens/SnippetsScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { styles } from "./theme/styles";
import { FleetRunResult, RouteTab, ServerProfile, Status, TerminalSendMode } from "./types";

function parseCommaTags(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(",")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    )
  );
}

function countMatches(output: string, searchTerm: string): number {
  const term = searchTerm.trim();
  if (!term) {
    return 0;
  }

  const regex = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
  return (output.match(regex) || []).length;
}

function normalizeMatchIndex(index: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return ((index % total) + total) % total;
}

function toServerShareLink(server: ServerProfile): string {
  return Linking.createURL("add-server", {
    queryParams: {
      name: server.name,
      url: server.baseUrl,
      cwd: server.defaultCwd,
    },
  });
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function makeFleetSessionName(): string {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  const suffix = Math.random().toString(36).slice(2, 6);
  return `fleet-${stamp}-${suffix}`;
}

export default function AppShell() {
  const [route, setRoute] = useState<RouteTab>("terminals");
  const [status, setStatus] = useState<Status>({ text: "Booting", error: false });
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [paywallVisible, setPaywallVisible] = useState<boolean>(false);
  const [tagFilter, setTagFilter] = useState<string>("");
  const [searchTerms, setSearchTerms] = useState<Record<string, string>>({});
  const [searchIndex, setSearchIndex] = useState<Record<string, number>>({});
  const [shareConfig, setShareConfig] = useState<{ title: string; link: string } | null>(null);
  const [fleetCommand, setFleetCommand] = useState<string>("");
  const [fleetCwd, setFleetCwd] = useState<string>("");
  const [fleetTargets, setFleetTargets] = useState<string[]>([]);
  const [fleetBusy, setFleetBusy] = useState<boolean>(false);
  const [fleetResults, setFleetResults] = useState<FleetRunResult[]>([]);

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

  const { loading: onboardingLoading, completed: onboardingCompleted, completeOnboarding } = useOnboarding();
  const { loading: lockLoading, requireBiometric, unlocked, setRequireBiometric, unlock, lock } = useBiometricLock();
  const { loading: tutorialLoading, done: tutorialDone, finish: finishTutorial } = useTutorial(onboardingCompleted && unlocked);
  const { permissionStatus, requestPermission, notify } = useNotifications();
  const { available: rcAvailable, isPro, priceLabel, purchasePro, restore } = useRevenueCat();
  const { snippets, upsertSnippet, deleteSnippet } = useSnippets();

  const {
    servers,
    activeServer,
    activeServerId,
    loadingSettings,
    serverNameInput,
    serverUrlInput,
    serverTokenInput,
    serverCwdInput,
    editingServerId,
    tokenMasked,
    setServerNameInput,
    setServerUrlInput,
    setServerTokenInput,
    setServerCwdInput,
    setTokenMasked,
    beginCreateServer,
    beginEditServer,
    importServerConfig,
    addServerDirect,
    saveServer,
    deleteServer,
    useServer,
  } = useServers({ onError: setError, enabled: unlocked });

  const connected = useMemo(() => {
    if (!activeServer) {
      return false;
    }
    return Boolean(normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  }, [activeServer]);

  const { capabilities, supportedFeatures } = useServerCapabilities({ activeServer, connected });

  const {
    allSessions,
    openSessions,
    tails,
    drafts,
    sendBusy,
    sendModes,
    startCwd,
    startPrompt,
    startOpenOnMac,
    startKind,
    focusedSession,
    setTails,
    setDrafts,
    setStartCwd,
    setStartPrompt,
    setStartOpenOnMac,
    setStartKind,
    setFocusedSession,
    resetTerminalState,
    refreshSessions,
    toggleSessionVisible,
    removeOpenSession,
    setSessionMode,
    handleStartSession,
    handleSend,
    sendCommand,
    handleStop,
    handleOpenOnMac,
  } = useTerminalSessions({ activeServer, connected });

  const { historyCount, addCommand, recallPrev, recallNext } = useCommandHistory(activeServerId);
  const { sessionTags, allTags, setTagsForSession, removeMissingSessions } = useSessionTags(activeServerId);
  const {
    currentPath,
    setCurrentPath,
    includeHidden,
    setIncludeHidden,
    entries: fileEntries,
    selectedFilePath,
    selectedContent,
    tailLines,
    setTailLines,
    listDirectory,
    readFile,
    tailFile,
    openEntry,
    goUp,
  } = useFilesBrowser({ activeServer, connected });

  const { streamLive, connectionMeta, fetchTail, connectStream, closeStream, closeAllStreams, closeStreamsNotIn } = useWebSocket({
    activeServer,
    connected,
    openSessions,
    setTails,
    onError: setError,
    onSessionClosed: (session) => {
      removeOpenSession(session);
      if (isPro) {
        void notify("Session closed", `${session} ended on the server.`);
      }
    },
    onStreamError: (session, message) => {
      if (isPro) {
        void notify("Session error", `${session}: ${message}`);
      }
    },
  });

  const health = useConnectionHealth({
    activeServer,
    connected,
    streamLive,
    openSessions,
  });

  const filteredSnippets = useMemo(() => {
    return snippets.filter((snippet) => {
      if (!snippet.serverId) {
        return true;
      }
      return activeServerId ? snippet.serverId === activeServerId : false;
    });
  }, [activeServerId, snippets]);

  useEffect(() => {
    if (servers.length === 0) {
      setFleetTargets([]);
      return;
    }

    setFleetTargets((prev) => {
      if (prev.length === 0 && activeServerId) {
        return [activeServerId];
      }
      const available = new Set(servers.map((server) => server.id));
      const filtered = prev.filter((id) => available.has(id));
      if (filtered.length > 0) {
        return filtered;
      }
      return activeServerId ? [activeServerId] : [servers[0].id];
    });
  }, [activeServerId, servers]);

  const runFleetCommand = useCallback(async () => {
    const command = fleetCommand.trim();
    if (!command) {
      throw new Error("Fleet command is required.");
    }

    const selectedServers = servers.filter((server) => fleetTargets.includes(server.id));
    if (selectedServers.length === 0) {
      throw new Error("Select at least one target server.");
    }

    setFleetBusy(true);
    try {
      const settled = await Promise.all(
        selectedServers.map(async (server): Promise<FleetRunResult> => {
          const cwd = fleetCwd.trim() || server.defaultCwd || DEFAULT_CWD;
          const session = makeFleetSessionName();
          try {
            await apiRequest(server.baseUrl, server.token, "/tmux/session", {
              method: "POST",
              body: JSON.stringify({ session, cwd }),
            });

            const data = await apiRequest<{ output?: string }>(server.baseUrl, server.token, "/shell/run", {
              method: "POST",
              body: JSON.stringify({ session, command, wait_ms: 1200, tail_lines: 280 }),
            });

            return {
              serverId: server.id,
              serverName: server.name,
              session,
              ok: true,
              output: data.output || "",
            };
          } catch (error) {
            return {
              serverId: server.id,
              serverName: server.name,
              session: null,
              ok: false,
              output: "",
              error: error instanceof Error ? error.message : String(error),
            };
          }
        })
      );

      setFleetResults(settled);
    } finally {
      setFleetBusy(false);
    }
  }, [fleetCommand, fleetCwd, fleetTargets, servers]);

  const runWithStatus = useCallback(
    async (label: string, fn: () => Promise<void>) => {
      setStatus({ text: label, error: false });
      try {
        await fn();
        setReady();
      } catch (error) {
        setError(error);
      }
    },
    [setError, setReady]
  );

  const requirePro = useCallback(() => {
    if (isPro) {
      return false;
    }
    setPaywallVisible(true);
    return true;
  }, [isPro]);

  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state !== "active") {
        lock();
      }
    });

    return () => {
      sub.remove();
    };
  }, [lock]);

  useEffect(() => {
    async function handleLink(url: string | null) {
      if (!url) {
        return;
      }

      const parsed = Linking.parse(url);
      if (parsed.path !== "add-server") {
        return;
      }

      const name = typeof parsed.queryParams?.name === "string" ? parsed.queryParams.name : "";
      const baseUrl = typeof parsed.queryParams?.url === "string" ? parsed.queryParams.url : "";
      const cwd = typeof parsed.queryParams?.cwd === "string" ? parsed.queryParams.cwd : "";
      importServerConfig({ name, url: baseUrl, cwd });
      setRoute("servers");
      setReady("Imported server config. Add your token and save.");
    }

    void Linking.getInitialURL().then((url) => {
      void handleLink(url);
    });

    const sub = Linking.addEventListener("url", ({ url }) => {
      void handleLink(url);
    });

    return () => {
      sub.remove();
    };
  }, [importServerConfig, setReady]);

  useEffect(() => {
    if (!loadingSettings) {
      setReady("Profiles loaded");
    }
  }, [loadingSettings, setReady]);

  useEffect(() => {
    if (!activeServer) {
      return;
    }

    setStartCwd(activeServer.defaultCwd || DEFAULT_CWD);
    resetTerminalState();
    closeAllStreams();

    if (!loadingSettings && connected) {
      void runWithStatus(`Syncing ${activeServer.name}`, async () => {
        await refreshSessions();
      });
    }
  }, [
    activeServer,
    activeServerId,
    closeAllStreams,
    connected,
    loadingSettings,
    refreshSessions,
    resetTerminalState,
    runWithStatus,
    setStartCwd,
  ]);

  useEffect(() => {
    if (!connected) {
      closeAllStreams();
      return;
    }

    closeStreamsNotIn(openSessions);
    openSessions.forEach((session) => {
      connectStream(session);
    });
  }, [closeAllStreams, closeStreamsNotIn, connectStream, connected, openSessions]);

  useEffect(() => {
    return () => {
      closeAllStreams();
    };
  }, [closeAllStreams]);

  useEffect(() => {
    if (!connected || openSessions.length === 0) {
      return;
    }

    const id = setInterval(() => {
      openSessions.forEach((session) => {
        if (!streamLive[session]) {
          void fetchTail(session, false);
        }
      });
    }, POLL_INTERVAL_MS);

    return () => clearInterval(id);
  }, [connected, fetchTail, openSessions, streamLive]);

  useEffect(() => {
    if (!connected || openSessions.length === 0) {
      return;
    }

    openSessions.forEach((session) => {
      void fetchTail(session, false);
    });
  }, [connected, fetchTail, openSessions]);

  useEffect(() => {
    void removeMissingSessions(allSessions);
  }, [allSessions, removeMissingSessions]);

  useEffect(() => {
    if (route !== "files" || !connected || !capabilities.files) {
      return;
    }
    void runWithStatus("Loading files", async () => {
      await listDirectory();
    });
  }, [activeServerId, capabilities.files, connected, includeHidden, listDirectory, route, runWithStatus]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshSessions();
      setReady();
    } catch (error) {
      setError(error);
    } finally {
      setRefreshing(false);
    }
  }, [refreshSessions, setError, setReady]);

  const activeServerName = activeServer?.name || "No Server";
  const focusedOutput = focusedSession ? tails[focusedSession] ?? "" : "";
  const focusedDraft = focusedSession ? drafts[focusedSession] ?? "" : "";
  const focusedIsSending = focusedSession ? Boolean(sendBusy[focusedSession]) : false;
  const focusedMode = focusedSession
    ? sendModes[focusedSession] || (isLikelyAiSession(focusedSession) ? "ai" : "shell")
    : "ai";

  const focusedSearchTerm = focusedSession ? searchTerms[focusedSession] ?? "" : "";
  const focusedMatchCount = focusedSession ? countMatches(focusedOutput, focusedSearchTerm) : 0;
  const focusedCursor = focusedSession ? searchIndex[focusedSession] ?? 0 : 0;
  const focusedMatchIndex = normalizeMatchIndex(focusedCursor, focusedMatchCount);
  const focusedSearchLabel = focusedMatchCount === 0 ? "0 matches" : `${focusedMatchIndex + 1}/${focusedMatchCount}`;

  if (lockLoading || onboardingLoading || tutorialLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="light" />
      </SafeAreaView>
    );
  }

  if (!unlocked) {
    return (
      <LockScreen
        onUnlock={() => {
          void runWithStatus("Unlocking", async () => {
            await unlock();
          });
        }}
      />
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />
      <View style={styles.bgBlobTop} />
      <View style={styles.bgBlobBottom} />

      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={12}
      >
        <ScrollView
          contentContainerStyle={styles.container}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            route === "terminals" ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#27d9ff" /> : undefined
          }
        >
          <View style={styles.panelHeader}>
            <Image source={BRAND_LOGO} style={styles.brandLogo} resizeMode="cover" />
            <View style={styles.headerTextBlock}>
              <Text style={styles.title}>NovaRemote</Text>
              <Text style={styles.subtitle}>Universal AI + Terminal Remote Control</Text>
            </View>
            <View style={styles.headerRowWrap}>
              <Text style={styles.serverBadge}>{activeServerName}</Text>
              <StatusPill status={status} />
            </View>
          </View>

          <TabBar
            route={route}
            onChange={(next) => {
              void Haptics.selectionAsync();
              if (next === "snippets" && !isPro) {
                setPaywallVisible(true);
                return;
              }
              if (next === "files" && !capabilities.files) {
                setStatus({ text: "Active server does not support file APIs.", error: true });
                return;
              }
              setRoute(next);
            }}
          />

          {route === "servers" ? (
            <ServersScreen
              servers={servers}
              activeServerId={activeServerId}
              serverNameInput={serverNameInput}
              serverUrlInput={serverUrlInput}
              serverTokenInput={serverTokenInput}
              serverCwdInput={serverCwdInput}
              editingServerId={editingServerId}
              tokenMasked={tokenMasked}
              requireBiometric={requireBiometric}
              onUseServer={(serverId) => {
                void runWithStatus("Switching server", async () => {
                  await useServer(serverId);
                  setRoute("terminals");
                });
              }}
              onBeginEditServer={(server) => {
                beginEditServer(server);
                setRoute("servers");
              }}
              onDeleteServer={(serverId) => {
                const label = servers.find((entry) => entry.id === serverId)?.name || "server";
                void runWithStatus(`Deleting ${label}`, async () => {
                  await deleteServer(serverId);
                });
              }}
              onShareServer={(server) => {
                setShareConfig({ title: server.name, link: toServerShareLink(server) });
              }}
              onSetServerName={setServerNameInput}
              onSetServerUrl={setServerUrlInput}
              onSetServerToken={setServerTokenInput}
              onSetServerCwd={setServerCwdInput}
              onSetRequireBiometric={(value) => {
                void runWithStatus("Updating lock setting", async () => {
                  await setRequireBiometric(value);
                });
              }}
              onToggleTokenMask={() => setTokenMasked((prev) => !prev)}
              onClearForm={beginCreateServer}
              onSaveServer={() => {
                void runWithStatus(editingServerId ? "Updating server" : "Saving server", async () => {
                  if (!editingServerId && !isPro && servers.length >= FREE_SERVER_LIMIT) {
                    setPaywallVisible(true);
                    return;
                  }
                  await saveServer();
                  setRoute("terminals");
                });
              }}
              onBackToTerminals={() => setRoute("terminals")}
            />
          ) : null}

          {route === "terminals" ? (
            <TerminalsScreen
              activeServer={activeServer}
              connected={connected}
              servers={servers}
              allSessions={allSessions}
              openSessions={openSessions}
              tails={tails}
              drafts={drafts}
              sendBusy={sendBusy}
              streamLive={streamLive}
              connectionMeta={connectionMeta}
              sendModes={sendModes}
              startCwd={startCwd}
              startPrompt={startPrompt}
              startOpenOnMac={startOpenOnMac}
              startKind={startKind}
              health={health}
              capabilities={capabilities}
              supportedFeatures={supportedFeatures}
              historyCount={historyCount}
              sessionTags={sessionTags}
              allTags={allTags}
              tagFilter={tagFilter}
              isPro={isPro}
              fleetCommand={fleetCommand}
              fleetCwd={fleetCwd}
              fleetTargets={fleetTargets}
              fleetBusy={fleetBusy}
              fleetResults={fleetResults}
              onShowPaywall={() => setPaywallVisible(true)}
              onSetTagFilter={setTagFilter}
              onSetStartCwd={setStartCwd}
              onSetStartPrompt={setStartPrompt}
              onSetStartOpenOnMac={setStartOpenOnMac}
              onSetStartKind={setStartKind}
              onRefreshSessions={() => {
                void runWithStatus("Refreshing sessions", async () => {
                  await refreshSessions();
                });
              }}
              onOpenServers={() => setRoute("servers")}
              onStartSession={() => {
                void runWithStatus("Starting session", async () => {
                  if (!isPro && openSessions.length >= FREE_SESSION_LIMIT) {
                    setPaywallVisible(true);
                    return;
                  }

                  if (startKind === "ai" && !capabilities.codex) {
                    throw new Error("Active server does not support Codex sessions.");
                  }

                  if (startKind === "shell" && !capabilities.shellRun) {
                    throw new Error("Active server does not support shell execution.");
                  }

                  await handleStartSession();
                  void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
                });
              }}
              onToggleSessionVisible={(session) => {
                if (!isPro && !openSessions.includes(session) && openSessions.length >= FREE_SESSION_LIMIT) {
                  setPaywallVisible(true);
                  return;
                }
                void Haptics.selectionAsync();
                toggleSessionVisible(session);
              }}
              onSetSessionMode={(session, mode) => {
                if (mode === "ai" && !capabilities.codex) {
                  setStatus({ text: "Active server does not support AI mode.", error: true });
                  return;
                }
                if (mode === "shell" && !capabilities.shellRun) {
                  setStatus({ text: "Active server does not support shell mode.", error: true });
                  return;
                }
                setSessionMode(session, mode);
              }}
              onOpenOnMac={(session) => {
                void runWithStatus(`Opening ${session} on Mac`, async () => {
                  if (!capabilities.macAttach) {
                    throw new Error("Active server does not support mac attach.");
                  }
                  await handleOpenOnMac(session);
                });
              }}
              onSyncSession={(session) => {
                void runWithStatus(`Syncing ${session}`, async () => {
                  await fetchTail(session, true);
                });
              }}
              onFocusSession={setFocusedSession}
              onStopSession={(session) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
                void runWithStatus(`Stopping ${session}`, async () => {
                  await handleStop(session);
                });
              }}
              onHideSession={(session) => {
                removeOpenSession(session);
                closeStream(session);
              }}
              onHistoryPrev={(session) => {
                const prev = recallPrev(session);
                if (prev !== null) {
                  setDrafts((existing) => ({ ...existing, [session]: prev }));
                }
              }}
              onHistoryNext={(session) => {
                const next = recallNext(session);
                if (next !== null) {
                  setDrafts((existing) => ({ ...existing, [session]: next }));
                }
              }}
              onSetTags={(session, raw) => {
                void setTagsForSession(session, parseCommaTags(raw));
              }}
              onSetDraft={(session, value) => {
                setDrafts((prev) => ({
                  ...prev,
                  [session]: value,
                }));
              }}
              onSend={(session) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void runWithStatus(`Sending to ${session}`, async () => {
                  const sent = await handleSend(session);
                  if (sent) {
                    await addCommand(session, sent);
                    if (isPro) {
                      await notify("Command completed", `${session}: ${sent.slice(0, 80)}`);
                    }
                  }
                });
              }}
              onClearDraft={(session) => {
                setDrafts((prev) => ({ ...prev, [session]: "" }));
              }}
              onSetFleetCommand={setFleetCommand}
              onSetFleetCwd={setFleetCwd}
              onToggleFleetTarget={(serverId) => {
                setFleetTargets((prev) => (prev.includes(serverId) ? prev.filter((id) => id !== serverId) : [...prev, serverId]));
              }}
              onRunFleet={() => {
                void runWithStatus("Running fleet command", async () => {
                  await runFleetCommand();
                });
              }}
            />
          ) : null}

          {route === "snippets" ? (
            <SnippetsScreen
              snippets={filteredSnippets}
              activeServerId={activeServerId}
              openSessions={openSessions}
              isPro={isPro}
              onShowPaywall={() => setPaywallVisible(true)}
              onSaveSnippet={(input) => {
                void runWithStatus(input.id ? "Updating snippet" : "Saving snippet", async () => {
                  if (requirePro()) {
                    return;
                  }
                  await upsertSnippet(input);
                });
              }}
              onDeleteSnippet={(id) => {
                void runWithStatus("Deleting snippet", async () => {
                  await deleteSnippet(id);
                });
              }}
              onInsertSnippet={(session, command) => {
                setDrafts((prev) => ({ ...prev, [session]: command }));
                setRoute("terminals");
              }}
              onRunSnippet={(session, command, mode) => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                void runWithStatus(`Running snippet in ${session}`, async () => {
                  await sendCommand(session, command, mode, false);
                  await addCommand(session, command);
                  if (isPro) {
                    await notify("Snippet completed", `${session}: ${command.slice(0, 80)}`);
                  }
                });
              }}
            />
          ) : null}

          {route === "files" ? (
            capabilities.files ? (
              <FilesScreen
                connected={connected}
                currentPath={currentPath}
                includeHidden={includeHidden}
                entries={fileEntries}
                selectedFilePath={selectedFilePath}
                selectedContent={selectedContent}
                tailLines={tailLines}
                openSessions={openSessions}
                onSetCurrentPath={setCurrentPath}
                onSetIncludeHidden={setIncludeHidden}
                onSetTailLines={setTailLines}
                onRefresh={() => {
                  void runWithStatus("Listing files", async () => {
                    await listDirectory();
                  });
                }}
                onGoUp={() => {
                  void runWithStatus("Navigating up", async () => {
                    await goUp();
                  });
                }}
                onOpenEntry={(entry) => {
                  void runWithStatus(entry.is_dir ? `Opening ${entry.name}` : `Reading ${entry.name}`, async () => {
                    await openEntry(entry);
                  });
                }}
                onReadSelected={() => {
                  if (!selectedFilePath) {
                    return;
                  }
                  void runWithStatus("Reading file", async () => {
                    await readFile(selectedFilePath);
                  });
                }}
                onTailSelected={() => {
                  if (!selectedFilePath) {
                    return;
                  }
                  void runWithStatus("Tailing file", async () => {
                    await tailFile(selectedFilePath);
                  });
                }}
                onInsertPath={(session, path) => {
                  setRoute("terminals");
                  setDrafts((prev) => ({ ...prev, [session]: path }));
                }}
                onSendPathCommand={(session, path) => {
                  void runWithStatus(`Running cat in ${session}`, async () => {
                    const command = `cat ${shellQuote(path)}`;
                    await sendCommand(session, command, "shell", false);
                    await addCommand(session, command);
                  });
                }}
              />
            ) : (
              <View style={styles.panel}>
                <Text style={styles.panelLabel}>Files Unavailable</Text>
                <Text style={styles.serverSubtitle}>This server does not expose `/files/*` endpoints.</Text>
              </View>
            )
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>

      <FullscreenTerminal
        session={focusedSession}
        output={focusedOutput}
        draft={focusedDraft}
        mode={focusedMode}
        isSending={focusedIsSending}
        searchTerm={focusedSearchTerm}
        searchMatchesLabel={focusedSearchLabel}
        activeMatchIndex={focusedMatchIndex}
        onClose={() => setFocusedSession(null)}
        onToggleMode={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.selectionAsync();
          const nextMode: TerminalSendMode = focusedMode === "ai" ? "shell" : "ai";
          if (nextMode === "ai" && !capabilities.codex) {
            setStatus({ text: "Active server does not support AI mode.", error: true });
            return;
          }
          if (nextMode === "shell" && !capabilities.shellRun) {
            setStatus({ text: "Active server does not support shell mode.", error: true });
            return;
          }
          setSessionMode(focusedSession, nextMode);
        }}
        onSearchChange={(value) => {
          if (!focusedSession) {
            return;
          }
          setSearchTerms((prev) => ({ ...prev, [focusedSession]: value }));
          setSearchIndex((prev) => ({ ...prev, [focusedSession]: 0 }));
        }}
        onSearchPrev={() => {
          if (!focusedSession || focusedMatchCount === 0) {
            return;
          }
          setSearchIndex((prev) => ({
            ...prev,
            [focusedSession]: (prev[focusedSession] ?? 0) - 1,
          }));
        }}
        onSearchNext={() => {
          if (!focusedSession || focusedMatchCount === 0) {
            return;
          }
          setSearchIndex((prev) => ({
            ...prev,
            [focusedSession]: (prev[focusedSession] ?? 0) + 1,
          }));
        }}
        onHistoryPrev={() => {
          if (!focusedSession) {
            return;
          }
          const prev = recallPrev(focusedSession);
          if (prev !== null) {
            setDrafts((existing) => ({ ...existing, [focusedSession]: prev }));
          }
        }}
        onHistoryNext={() => {
          if (!focusedSession) {
            return;
          }
          const next = recallNext(focusedSession);
          if (next !== null) {
            setDrafts((existing) => ({ ...existing, [focusedSession]: next }));
          }
        }}
        onDraftChange={(value) => {
          if (!focusedSession) {
            return;
          }
          setDrafts((prev) => ({ ...prev, [focusedSession]: value }));
        }}
        onSend={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          void runWithStatus(`Sending to ${focusedSession}`, async () => {
            const sent = await handleSend(focusedSession);
            if (sent) {
              await addCommand(focusedSession, sent);
            }
          });
        }}
        onStop={() => {
          if (!focusedSession) {
            return;
          }
          void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
          void runWithStatus(`Stopping ${focusedSession}`, async () => {
            await handleStop(focusedSession);
          });
        }}
      />

      <PaywallModal
        visible={paywallVisible}
        priceLabel={priceLabel}
        onClose={() => setPaywallVisible(false)}
        onUpgrade={() => {
          void runWithStatus("Purchasing Pro", async () => {
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await purchasePro();
            if (pro) {
              setPaywallVisible(false);
            }
          });
        }}
        onRestore={() => {
          void runWithStatus("Restoring purchases", async () => {
            if (!rcAvailable) {
              throw new Error("RevenueCat keys are not configured yet.");
            }
            const pro = await restore();
            if (pro) {
              setPaywallVisible(false);
            }
          });
        }}
      />

      <OnboardingModal
        visible={!onboardingCompleted}
        notificationsGranted={permissionStatus === "granted"}
        onRequestNotifications={() => {
          void requestPermission();
        }}
        onTestConnection={async (server) => {
          const response = await fetch(`${normalizeBaseUrl(server.url)}/health`, {
            method: "GET",
            headers: {
              Authorization: `Bearer ${server.token}`,
            },
          });

          if (!response.ok) {
            throw new Error(`Connection failed: ${response.status}`);
          }

          setReady("Server connection looks good");
        }}
        onComplete={(server, biometric) => {
          void runWithStatus("Completing onboarding", async () => {
            await addServerDirect({
              name: server.name,
              baseUrl: server.url,
              token: server.token,
              defaultCwd: server.cwd,
            });
            await setRequireBiometric(biometric);
            await completeOnboarding();
            setRoute("terminals");
          });
        }}
      />

      <ShareServerModal
        visible={Boolean(shareConfig)}
        title={shareConfig?.title || "Server"}
        value={shareConfig?.link || ""}
        onClose={() => setShareConfig(null)}
      />

      <TutorialModal
        visible={onboardingCompleted && !tutorialDone}
        onDone={() => {
          void runWithStatus("Tutorial complete", async () => {
            await finishTutorial();
          });
        }}
      />
    </SafeAreaView>
  );
}

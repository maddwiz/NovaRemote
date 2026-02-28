import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";

import { normalizeBaseUrl } from "./api/client";
import { FullscreenTerminal } from "./components/FullscreenTerminal";
import { StatusPill } from "./components/StatusPill";
import { TabBar } from "./components/TabBar";
import { BRAND_LOGO, DEFAULT_CWD, POLL_INTERVAL_MS, isLikelyAiSession } from "./constants";
import { useServers } from "./hooks/useServers";
import { useTerminalSessions } from "./hooks/useTerminalSessions";
import { useWebSocket } from "./hooks/useWebSocket";
import { ServersScreen } from "./screens/ServersScreen";
import { TerminalsScreen } from "./screens/TerminalsScreen";
import { styles } from "./theme/styles";
import { RouteTab, Status } from "./types";

export default function AppShell() {
  const [route, setRoute] = useState<RouteTab>("terminals");
  const [status, setStatus] = useState<Status>({ text: "Booting", error: false });
  const [refreshing, setRefreshing] = useState<boolean>(false);

  const setReady = useCallback((text: string = "Ready") => {
    setStatus({ text, error: false });
  }, []);

  const setError = useCallback((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    setStatus({ text: message, error: true });
  }, []);

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
    saveServer,
    deleteServer,
    useServer,
  } = useServers({ onError: setError });

  const connected = useMemo(() => {
    if (!activeServer) {
      return false;
    }
    return Boolean(normalizeBaseUrl(activeServer.baseUrl) && activeServer.token.trim());
  }, [activeServer]);

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
    handleStop,
    handleOpenOnMac,
  } = useTerminalSessions({ activeServer, connected });

  const { streamLive, fetchTail, connectStream, closeStream, closeAllStreams, closeStreamsNotIn } = useWebSocket({
    activeServer,
    connected,
    openSessions,
    setTails,
    onError: setError,
  });

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

          <TabBar route={route} onChange={setRoute} />

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
              onSetServerName={setServerNameInput}
              onSetServerUrl={setServerUrlInput}
              onSetServerToken={setServerTokenInput}
              onSetServerCwd={setServerCwdInput}
              onToggleTokenMask={() => setTokenMasked((prev) => !prev)}
              onClearForm={beginCreateServer}
              onSaveServer={() => {
                void runWithStatus(editingServerId ? "Updating server" : "Saving server", async () => {
                  await saveServer();
                  setRoute("terminals");
                });
              }}
              onBackToTerminals={() => setRoute("terminals")}
            />
          ) : (
            <TerminalsScreen
              activeServer={activeServer}
              connected={connected}
              allSessions={allSessions}
              openSessions={openSessions}
              tails={tails}
              drafts={drafts}
              sendBusy={sendBusy}
              streamLive={streamLive}
              sendModes={sendModes}
              startCwd={startCwd}
              startPrompt={startPrompt}
              startOpenOnMac={startOpenOnMac}
              startKind={startKind}
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
                  await handleStartSession();
                });
              }}
              onToggleSessionVisible={toggleSessionVisible}
              onSetSessionMode={setSessionMode}
              onOpenOnMac={(session) => {
                void runWithStatus(`Opening ${session} on Mac`, async () => {
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
                void runWithStatus(`Stopping ${session}`, async () => {
                  await handleStop(session);
                });
              }}
              onHideSession={(session) => {
                removeOpenSession(session);
                closeStream(session);
              }}
              onSetDraft={(session, value) => {
                setDrafts((prev) => ({
                  ...prev,
                  [session]: value,
                }));
              }}
              onSend={(session) => {
                void runWithStatus(`Sending to ${session}`, async () => {
                  await handleSend(session);
                });
              }}
              onClearDraft={(session) => {
                setDrafts((prev) => ({ ...prev, [session]: "" }));
              }}
            />
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      <FullscreenTerminal
        session={focusedSession}
        output={focusedOutput}
        draft={focusedDraft}
        mode={focusedMode}
        isSending={focusedIsSending}
        onClose={() => setFocusedSession(null)}
        onToggleMode={() => {
          if (!focusedSession) {
            return;
          }
          setSessionMode(focusedSession, focusedMode === "ai" ? "shell" : "ai");
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
          void runWithStatus(`Sending to ${focusedSession}`, async () => {
            await handleSend(focusedSession);
          });
        }}
        onStop={() => {
          if (!focusedSession) {
            return;
          }
          void runWithStatus(`Stopping ${focusedSession}`, async () => {
            await handleStop(focusedSession);
          });
        }}
      />
    </SafeAreaView>
  );
}

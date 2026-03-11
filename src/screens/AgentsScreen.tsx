import React, { useMemo } from "react";
import { Text, View } from "react-native";

import { useAppContext } from "../context/AppContext";
import { NovaAgentPanel } from "../components/NovaAgentPanel";
import { PageHeroCard } from "../components/PageHeroCard";
import { styles } from "../theme/styles";

export function AgentsScreen() {
  const { terminals } = useAppContext();
  const {
    activeServer,
    focusedServerId,
    openSessions,
    isPro,
    connected,
    connections,
    onShowPaywall,
    onSendServerSessionCommand,
  } = terminals;

  const focusedConnection = useMemo(
    () => (focusedServerId ? connections.get(focusedServerId) ?? null : null),
    [connections, focusedServerId]
  );

  const heroStats = useMemo(
    () => [
      { label: "Focused", value: activeServer?.name || "None" },
      { label: "Runtime", value: focusedConnection?.connected ? "Online" : connected ? "Connected" : "Offline" },
      { label: "Sessions", value: `${openSessions.length}` },
    ],
    [activeServer?.name, connected, focusedConnection?.connected, openSessions.length]
  );

  return (
    <>
      <PageHeroCard
        eyebrow="Agent Runtime"
        title="Create, review, approve, retry, and monitor agents."
        summary="Use the server-backed NovaAdapt runtime for plans, jobs, workflows, and approvals while keeping the local preview available as a fallback."
        tone="violet"
        stats={heroStats}
      />

      {!focusedServerId ? (
        <View style={styles.panel}>
          <Text style={styles.panelLabel}>No Focused Server</Text>
          <Text style={styles.emptyText}>Select a server first, then come back here to manage its NovaAdapt runtime.</Text>
        </View>
      ) : null}

      <NovaAgentPanel
        server={activeServer}
        serverId={focusedServerId}
        serverName={activeServer?.name || null}
        sessions={openSessions}
        isPro={isPro}
        onShowPaywall={onShowPaywall}
        onQueueCommand={(session, command) => {
          if (!focusedServerId) {
            return;
          }
          onSendServerSessionCommand(focusedServerId, session, command, "shell");
        }}
        surface="screen"
      />
    </>
  );
}

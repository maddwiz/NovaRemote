import React from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, DEFAULT_SERVER_NAME, SERVER_URL_PLACEHOLDER } from "../constants";
import { styles } from "../theme/styles";
import { ServerProfile } from "../types";
import { ServerCard } from "../components/ServerCard";

type ServersScreenProps = {
  servers: ServerProfile[];
  activeServerId: string | null;
  serverNameInput: string;
  serverUrlInput: string;
  serverTokenInput: string;
  serverCwdInput: string;
  editingServerId: string | null;
  tokenMasked: boolean;
  onUseServer: (serverId: string) => void;
  onBeginEditServer: (server: ServerProfile) => void;
  onDeleteServer: (serverId: string) => void;
  onSetServerName: (value: string) => void;
  onSetServerUrl: (value: string) => void;
  onSetServerToken: (value: string) => void;
  onSetServerCwd: (value: string) => void;
  onToggleTokenMask: () => void;
  onClearForm: () => void;
  onSaveServer: () => void;
  onBackToTerminals: () => void;
};

export function ServersScreen({
  servers,
  activeServerId,
  serverNameInput,
  serverUrlInput,
  serverTokenInput,
  serverCwdInput,
  editingServerId,
  tokenMasked,
  onUseServer,
  onBeginEditServer,
  onDeleteServer,
  onSetServerName,
  onSetServerUrl,
  onSetServerToken,
  onSetServerCwd,
  onToggleTokenMask,
  onClearForm,
  onSaveServer,
  onBackToTerminals,
}: ServersScreenProps) {
  return (
    <View style={styles.panel}>
      <Text style={styles.panelLabel}>Server Profiles</Text>
      {servers.length === 0 ? <Text style={styles.emptyText}>No servers yet.</Text> : null}

      <View style={styles.serverListWrap}>
        {servers.map((server) => (
          <ServerCard
            key={server.id}
            server={server}
            isActive={server.id === activeServerId}
            onUse={onUseServer}
            onEdit={onBeginEditServer}
            onDelete={onDeleteServer}
          />
        ))}
      </View>

      <View style={styles.formDivider} />
      <Text style={styles.panelLabel}>{editingServerId ? "Edit Server" : "Add Server"}</Text>
      <TextInput
        style={styles.input}
        value={serverNameInput}
        autoCapitalize="words"
        autoCorrect={false}
        placeholder={DEFAULT_SERVER_NAME}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerName}
      />
      <TextInput
        style={styles.input}
        value={serverUrlInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={SERVER_URL_PLACEHOLDER}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerUrl}
      />
      <TextInput
        style={styles.input}
        value={serverTokenInput}
        secureTextEntry={tokenMasked}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="Bearer token"
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerToken}
      />
      <TextInput
        style={styles.input}
        value={serverCwdInput}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder={CWD_PLACEHOLDER}
        placeholderTextColor="#7f7aa8"
        onChangeText={onSetServerCwd}
      />

      <View style={styles.rowInlineSpace}>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onToggleTokenMask}>
          <Text style={styles.buttonGhostText}>{tokenMasked ? "Show Token" : "Hide Token"}</Text>
        </Pressable>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onClearForm}>
          <Text style={styles.buttonGhostText}>Clear Form</Text>
        </Pressable>
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable style={[styles.buttonPrimary, styles.flexButton]} onPress={onSaveServer}>
          <Text style={styles.buttonPrimaryText}>{editingServerId ? "Update Server" : "Save Server"}</Text>
        </Pressable>
        <Pressable style={[styles.buttonGhost, styles.flexButton]} onPress={onBackToTerminals}>
          <Text style={styles.buttonGhostText}>Back to Terminal</Text>
        </Pressable>
      </View>
    </View>
  );
}

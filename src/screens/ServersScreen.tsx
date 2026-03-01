import React, { useState } from "react";
import { Pressable, Switch, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, DEFAULT_SERVER_NAME, SERVER_URL_PLACEHOLDER, SSH_HOST_PLACEHOLDER, SSH_USER_PLACEHOLDER } from "../constants";
import { styles } from "../theme/styles";
import { ServerProfile, SharedServerTemplate, TerminalBackendKind } from "../types";
import { ServerCard } from "../components/ServerCard";
import { useQrSetup } from "../hooks/useQrSetup";
import { QrScannerModal } from "../components/QrScannerModal";

type ServersScreenProps = {
  servers: ServerProfile[];
  activeServerId: string | null;
  serverNameInput: string;
  serverUrlInput: string;
  serverTokenInput: string;
  serverCwdInput: string;
  serverBackendInput: TerminalBackendKind;
  serverSshHostInput: string;
  serverSshUserInput: string;
  serverSshPortInput: string;
  serverPortainerUrlInput: string;
  serverProxmoxUrlInput: string;
  serverGrafanaUrlInput: string;
  editingServerId: string | null;
  tokenMasked: boolean;
  isPro: boolean;
  analyticsEnabled: boolean;
  analyticsAnonId: string;
  myReferralCode: string;
  claimedReferralCode: string;
  referralCodeInput: string;
  growthStatus: string;
  sharedTemplatesPayload: string;
  sharedTemplatesStatus: string;
  sharedTemplates: SharedServerTemplate[];
  requireBiometric: boolean;
  requireDangerConfirm: boolean;
  onUseServer: (serverId: string) => void;
  onBeginEditServer: (server: ServerProfile) => void;
  onDeleteServer: (serverId: string) => void;
  onShareServer: (server: ServerProfile) => void;
  onOpenServerSsh: (server: ServerProfile) => void;
  onImportServerConfig: (config: {
    name?: string;
    url?: string;
    token?: string;
    cwd?: string;
    backend?: string;
    sshHost?: string;
    sshUser?: string;
    sshPort?: string | number;
  }) => void;
  onSetServerName: (value: string) => void;
  onSetServerUrl: (value: string) => void;
  onSetServerToken: (value: string) => void;
  onSetServerCwd: (value: string) => void;
  onSetServerBackend: (value: TerminalBackendKind) => void;
  onSetServerSshHost: (value: string) => void;
  onSetServerSshUser: (value: string) => void;
  onSetServerSshPort: (value: string) => void;
  onSetServerPortainerUrl: (value: string) => void;
  onSetServerProxmoxUrl: (value: string) => void;
  onSetServerGrafanaUrl: (value: string) => void;
  onSetAnalyticsEnabled: (value: boolean) => void;
  onShareReferral: () => void;
  onSetReferralCodeInput: (value: string) => void;
  onClaimReferralCode: () => void;
  onSetSharedTemplatesPayload: (value: string) => void;
  onExportSharedTemplates: () => void;
  onImportSharedTemplates: () => void;
  onApplySharedTemplate: (template: SharedServerTemplate) => void;
  onDeleteSharedTemplate: (templateId: string) => void;
  onShowPaywall: () => void;
  onSetRequireBiometric: (value: boolean) => void;
  onSetRequireDangerConfirm: (value: boolean) => void;
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
  serverBackendInput,
  serverSshHostInput,
  serverSshUserInput,
  serverSshPortInput,
  serverPortainerUrlInput,
  serverProxmoxUrlInput,
  serverGrafanaUrlInput,
  editingServerId,
  tokenMasked,
  isPro,
  analyticsEnabled,
  analyticsAnonId,
  myReferralCode,
  claimedReferralCode,
  referralCodeInput,
  growthStatus,
  sharedTemplatesPayload,
  sharedTemplatesStatus,
  sharedTemplates,
  requireBiometric,
  requireDangerConfirm,
  onUseServer,
  onBeginEditServer,
  onDeleteServer,
  onShareServer,
  onOpenServerSsh,
  onImportServerConfig,
  onSetServerName,
  onSetServerUrl,
  onSetServerToken,
  onSetServerCwd,
  onSetServerBackend,
  onSetServerSshHost,
  onSetServerSshUser,
  onSetServerSshPort,
  onSetServerPortainerUrl,
  onSetServerProxmoxUrl,
  onSetServerGrafanaUrl,
  onSetAnalyticsEnabled,
  onShareReferral,
  onSetReferralCodeInput,
  onClaimReferralCode,
  onSetSharedTemplatesPayload,
  onExportSharedTemplates,
  onImportSharedTemplates,
  onApplySharedTemplate,
  onDeleteSharedTemplate,
  onShowPaywall,
  onSetRequireBiometric,
  onSetRequireDangerConfirm,
  onToggleTokenMask,
  onClearForm,
  onSaveServer,
  onBackToTerminals,
}: ServersScreenProps) {
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>("");
  const { parseQrPayload } = useQrSetup();

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
            onShare={onShareServer}
            onOpenSsh={onOpenServerSsh}
          />
        ))}
      </View>

      <View style={styles.formDivider} />
      <Text style={styles.panelLabel}>{editingServerId ? "Edit Server" : "Add Server"}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Scan QR code for server setup"
        style={styles.buttonGhost}
        onPress={() => {
          setQrError("");
          setShowQrScanner(true);
        }}
      >
        <Text style={styles.buttonGhostText}>Scan QR Code</Text>
      </Pressable>
      <Text style={styles.emptyText}>or enter manually</Text>
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
      {qrError ? <Text style={styles.emptyText}>{qrError}</Text> : null}

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Direct SSH Fallback (Optional)</Text>
        <Text style={styles.serverSubtitle}>Launches an installed SSH app via `ssh://` when companion APIs are unavailable.</Text>
        <TextInput
          style={styles.input}
          value={serverSshHostInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={SSH_HOST_PLACEHOLDER}
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerSshHost}
        />
        <TextInput
          style={styles.input}
          value={serverSshUserInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder={SSH_USER_PLACEHOLDER}
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerSshUser}
        />
        <TextInput
          style={styles.input}
          value={serverSshPortInput}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="number-pad"
          placeholder="22"
          placeholderTextColor="#7f7aa8"
          onChangeText={(value) => onSetServerSshPort(value.replace(/[^0-9]/g, ""))}
        />
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Terminal Backend</Text>
        <Text style={styles.serverSubtitle}>Metadata hint for server runtime and future orchestration defaults.</Text>
        <View style={styles.actionsWrap}>
          {(["auto", "tmux", "screen", "zellij", "powershell", "cmd", "pty"] as TerminalBackendKind[]).map((backend) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Set terminal backend to ${backend}`}
              key={backend}
              style={[styles.modeButton, serverBackendInput === backend ? styles.modeButtonOn : null]}
              onPress={() => onSetServerBackend(backend)}
            >
              <Text style={[styles.modeButtonText, serverBackendInput === backend ? styles.modeButtonTextOn : null]}>
                {backend}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Self-Hosted Integrations (Optional)</Text>
        <Text style={styles.serverSubtitle}>Quick-link metadata for tools like Portainer, Proxmox, and Grafana.</Text>
        <TextInput
          style={styles.input}
          value={serverPortainerUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://portainer.example.com"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerPortainerUrl}
        />
        <TextInput
          style={styles.input}
          value={serverProxmoxUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://proxmox.example.com:8006"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerProxmoxUrl}
        />
        <TextInput
          style={styles.input}
          value={serverGrafanaUrlInput}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://grafana.example.com"
          placeholderTextColor="#7f7aa8"
          onChangeText={onSetServerGrafanaUrl}
        />
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable accessibilityRole="button" accessibilityLabel={tokenMasked ? "Show server token" : "Hide server token"} style={[styles.buttonGhost, styles.flexButton]} onPress={onToggleTokenMask}>
          <Text style={styles.buttonGhostText}>{tokenMasked ? "Show Token" : "Hide Token"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Clear server form" style={[styles.buttonGhost, styles.flexButton]} onPress={onClearForm}>
          <Text style={styles.buttonGhostText}>Clear Form</Text>
        </Pressable>
      </View>

      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Require Face ID / Touch ID</Text>
        <Switch
          accessibilityLabel="Require Face ID or Touch ID"
          trackColor={{ false: "#33596c", true: "#0ea8c8" }}
          thumbColor={requireBiometric ? "#d4fdff" : "#d3dee5"}
          value={requireBiometric}
          onValueChange={onSetRequireBiometric}
        />
      </View>

      <View style={styles.rowInlineSpace}>
        <Text style={styles.switchLabel}>Confirm Dangerous Commands</Text>
        <Switch
          accessibilityLabel="Require dangerous command confirmation"
          trackColor={{ false: "#33596c", true: "#0ea8c8" }}
          thumbColor={requireDangerConfirm ? "#d4fdff" : "#d3dee5"}
          value={requireDangerConfirm}
          onValueChange={onSetRequireDangerConfirm}
        />
      </View>

      <View style={styles.serverCard}>
        <Text style={styles.panelLabel}>Growth / Monetization</Text>
        <Text style={styles.serverSubtitle}>Anonymous analytics + referrals + Pro shared team templates.</Text>

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Anonymous Analytics</Text>
          <Switch
            accessibilityLabel="Enable anonymous analytics"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={analyticsEnabled ? "#d4fdff" : "#d3dee5"}
            value={analyticsEnabled}
            onValueChange={onSetAnalyticsEnabled}
          />
        </View>
        <Text style={styles.emptyText}>{`Anon ID: ${analyticsAnonId || "initializing..."}`}</Text>

        <Text style={styles.panelLabel}>Referral Program</Text>
        <Text style={styles.emptyText}>{`Your code: ${myReferralCode || "..."}`}</Text>
        {claimedReferralCode ? <Text style={styles.emptyText}>{`Claimed code: ${claimedReferralCode}`}</Text> : null}
        <View style={styles.rowInlineSpace}>
          <Pressable accessibilityRole="button" accessibilityLabel="Share referral link" style={[styles.buttonGhost, styles.flexButton]} onPress={onShareReferral}>
            <Text style={styles.buttonGhostText}>Share Referral Link</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Claim referral code" style={[styles.buttonPrimary, styles.flexButton]} onPress={onClaimReferralCode}>
            <Text style={styles.buttonPrimaryText}>Claim Code</Text>
          </Pressable>
        </View>
        <TextInput
          style={styles.input}
          value={referralCodeInput}
          onChangeText={onSetReferralCodeInput}
          autoCapitalize="characters"
          autoCorrect={false}
          placeholder="Enter referral code"
          placeholderTextColor="#7f7aa8"
        />

        <Text style={styles.panelLabel}>Team Shared Profiles (Pro)</Text>
        {!isPro ? (
          <View style={styles.rowInlineSpace}>
            <Text style={styles.emptyText}>Upgrade to Pro to unlock team profile sharing.</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Upgrade to Pro" style={styles.actionButton} onPress={onShowPaywall}>
              <Text style={styles.actionButtonText}>Upgrade</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <View style={styles.rowInlineSpace}>
              <Pressable accessibilityRole="button" accessibilityLabel="Export current servers as shared templates" style={[styles.buttonGhost, styles.flexButton]} onPress={onExportSharedTemplates}>
                <Text style={styles.buttonGhostText}>Export Team Templates</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Import shared templates from payload" style={[styles.buttonPrimary, styles.flexButton]} onPress={onImportSharedTemplates}>
                <Text style={styles.buttonPrimaryText}>Import Templates</Text>
              </Pressable>
            </View>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={sharedTemplatesPayload}
              onChangeText={onSetSharedTemplatesPayload}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="Paste shared templates payload JSON"
              placeholderTextColor="#7f7aa8"
              multiline
            />

            {sharedTemplates.length === 0 ? <Text style={styles.emptyText}>No shared templates imported yet.</Text> : null}
            {sharedTemplates.map((template) => (
              <View key={template.id} style={styles.serverCard}>
                <Text style={styles.serverName}>{template.name}</Text>
                <Text style={styles.serverSubtitle}>{template.baseUrl}</Text>
                <Text style={styles.emptyText}>{template.defaultCwd || "(no default cwd)"}</Text>
                <View style={styles.actionsWrap}>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Apply shared template ${template.name}`} style={styles.actionButton} onPress={() => onApplySharedTemplate(template)}>
                    <Text style={styles.actionButtonText}>Apply Template</Text>
                  </Pressable>
                  <Pressable accessibilityRole="button" accessibilityLabel={`Delete shared template ${template.name}`} style={styles.actionDangerButton} onPress={() => onDeleteSharedTemplate(template.id)}>
                    <Text style={styles.actionDangerText}>Delete</Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </>
        )}

        {growthStatus ? <Text style={styles.emptyText}>{growthStatus}</Text> : null}
        {sharedTemplatesStatus ? <Text style={styles.emptyText}>{sharedTemplatesStatus}</Text> : null}
      </View>

      <View style={styles.rowInlineSpace}>
        <Pressable accessibilityRole="button" accessibilityLabel={editingServerId ? "Update server profile" : "Save server profile"} style={[styles.buttonPrimary, styles.flexButton]} onPress={onSaveServer}>
          <Text style={styles.buttonPrimaryText}>{editingServerId ? "Update Server" : "Save Server"}</Text>
        </Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to terminals screen" style={[styles.buttonGhost, styles.flexButton]} onPress={onBackToTerminals}>
          <Text style={styles.buttonGhostText}>Back to Terminal</Text>
        </Pressable>
      </View>

      <QrScannerModal
        visible={showQrScanner}
        onClose={() => setShowQrScanner(false)}
        onScanned={(raw) => {
          const parsed = parseQrPayload(raw);
          if (!parsed) {
            setShowQrScanner(false);
            setQrError("QR code not recognized. Enter server details manually.");
            return;
          }
          setShowQrScanner(false);
          setQrError("");
          onImportServerConfig({
            name: parsed.name,
            url: parsed.url,
            token: parsed.token,
            cwd: parsed.cwd,
            backend: parsed.backend,
            sshHost: parsed.sshHost,
            sshUser: parsed.sshUser,
            sshPort: parsed.sshPort,
          });
        }}
      />
    </View>
  );
}

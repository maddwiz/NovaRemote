import React, { useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, Switch, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, DEFAULT_SERVER_NAME, SERVER_URL_PLACEHOLDER } from "../constants";
import { styles } from "../theme/styles";

type OnboardingServer = {
  name: string;
  url: string;
  token: string;
  cwd: string;
};

type OnboardingModalProps = {
  visible: boolean;
  notificationsGranted: boolean;
  onRequestNotifications: () => void;
  onTestConnection: (server: OnboardingServer) => Promise<void>;
  onComplete: (server: OnboardingServer, requireBiometric: boolean) => void;
};

export function OnboardingModal({
  visible,
  notificationsGranted,
  onRequestNotifications,
  onTestConnection,
  onComplete,
}: OnboardingModalProps) {
  const [step, setStep] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [tested, setTested] = useState<boolean>(false);
  const [requireBiometric, setRequireBiometric] = useState<boolean>(true);

  const [name, setName] = useState<string>(DEFAULT_SERVER_NAME);
  const [url, setUrl] = useState<string>("");
  const [token, setToken] = useState<string>("");
  const [cwd, setCwd] = useState<string>("");

  const canContinue = useMemo(() => {
    if (step === 1) {
      return Boolean(url.trim() && token.trim());
    }
    return true;
  }, [step, token, url]);

  const server = useMemo(
    () => ({ name: name.trim() || DEFAULT_SERVER_NAME, url: url.trim(), token: token.trim(), cwd: cwd.trim() }),
    [cwd, name, token, url]
  );

  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="slide">
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          {step === 0 ? (
            <>
              <Text style={styles.title}>Welcome to NovaRemote</Text>
              <Text style={styles.serverSubtitle}>Control AI and shell sessions from your phone in real time.</Text>
              <Text style={styles.emptyText}>Next: connect your first companion server.</Text>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <Text style={styles.panelLabel}>Add Your First Server</Text>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder={DEFAULT_SERVER_NAME}
                placeholderTextColor="#7f7aa8"
              />
              <TextInput
                style={styles.input}
                value={url}
                onChangeText={setUrl}
                placeholder={SERVER_URL_PLACEHOLDER}
                placeholderTextColor="#7f7aa8"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                value={token}
                onChangeText={setToken}
                placeholder="Bearer token"
                placeholderTextColor="#7f7aa8"
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TextInput
                style={styles.input}
                value={cwd}
                onChangeText={setCwd}
                placeholder={CWD_PLACEHOLDER}
                placeholderTextColor="#7f7aa8"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Pressable accessibilityRole="button"
                style={[styles.buttonGhost, busy ? styles.buttonDisabled : null]}
                disabled={busy}
                onPress={() => {
                  setBusy(true);
                  void onTestConnection(server)
                    .then(() => setTested(true))
                    .finally(() => setBusy(false));
                }}
              >
                <Text style={styles.buttonGhostText}>{busy ? "Testing..." : tested ? "Connection OK" : "Test Connection"}</Text>
              </Pressable>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.panelLabel}>Secure and Notify</Text>
              <View style={styles.rowInlineSpace}>
                <Text style={styles.switchLabel}>Require Face ID / Touch ID</Text>
                <Switch
                  trackColor={{ false: "#33596c", true: "#0ea8c8" }}
                  thumbColor={requireBiometric ? "#d4fdff" : "#d3dee5"}
                  value={requireBiometric}
                  onValueChange={setRequireBiometric}
                />
              </View>

              <Pressable accessibilityRole="button" style={styles.buttonGhost} onPress={onRequestNotifications}>
                <Text style={styles.buttonGhostText}>{notificationsGranted ? "Notifications Enabled" : "Enable Notifications"}</Text>
              </Pressable>

              <Text style={styles.emptyText}>Tip: Tap any session card to open fullscreen controls and search output.</Text>
            </>
          ) : null}

          <View style={styles.rowInlineSpace}>
            {step > 0 ? (
              <Pressable accessibilityRole="button" style={[styles.buttonGhost, styles.flexButton]} onPress={() => setStep((prev) => prev - 1)}>
                <Text style={styles.buttonGhostText}>Back</Text>
              </Pressable>
            ) : null}
            {step < 2 ? (
              <Pressable accessibilityRole="button"
                style={[styles.buttonPrimary, styles.flexButton, !canContinue ? styles.buttonDisabled : null]}
                disabled={!canContinue}
                onPress={() => setStep((prev) => prev + 1)}
              >
                <Text style={styles.buttonPrimaryText}>Next</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button"
                style={styles.buttonPrimary}
                onPress={() => {
                  onComplete(server, requireBiometric);
                  setStep(0);
                  setTested(false);
                }}
              >
                <Text style={styles.buttonPrimaryText}>Finish Setup</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

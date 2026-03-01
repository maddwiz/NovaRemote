import React, { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, SafeAreaView, Switch, Text, TextInput, View } from "react-native";

import { CWD_PLACEHOLDER, DEFAULT_SERVER_NAME, SERVER_URL_PLACEHOLDER } from "../constants";
import { styles } from "../theme/styles";
import { useQrSetup } from "../hooks/useQrSetup";
import { QrScannerModal } from "./QrScannerModal";

type OnboardingServer = {
  name: string;
  url: string;
  token: string;
  cwd: string;
};

type OnboardingModalProps = {
  visible: boolean;
  notificationsGranted: boolean;
  microphoneGranted: boolean;
  onRequestNotifications: () => void;
  onRequestMicrophone: () => void;
  onTestConnection: (server: OnboardingServer) => Promise<void>;
  onComplete: (server: OnboardingServer, requireBiometric: boolean) => void;
};

export function OnboardingModal({
  visible,
  notificationsGranted,
  microphoneGranted,
  onRequestNotifications,
  onRequestMicrophone,
  onTestConnection,
  onComplete,
}: OnboardingModalProps) {
  const [step, setStep] = useState<number>(0);
  const [busy, setBusy] = useState<boolean>(false);
  const [tested, setTested] = useState<boolean>(false);
  const [requireBiometric, setRequireBiometric] = useState<boolean>(true);
  const [showQrScanner, setShowQrScanner] = useState<boolean>(false);
  const [qrError, setQrError] = useState<string>("");
  const { parseQrPayload } = useQrSetup();

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

  const testConnection = useCallback(
    async (target: OnboardingServer) => {
      setBusy(true);
      try {
        await onTestConnection(target);
        setTested(true);
        setQrError("");
      } catch (error) {
        setTested(false);
        setQrError(error instanceof Error ? error.message : String(error));
      } finally {
        setBusy(false);
      }
    },
    [onTestConnection]
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
                accessibilityLabel="Test server connection"
                accessibilityHint="Checks the provided server URL and token."
                style={[styles.buttonGhost, busy ? styles.buttonDisabled : null]}
                disabled={busy}
                onPress={() => {
                  void testConnection(server);
                }}
              >
                <Text style={styles.buttonGhostText}>{busy ? "Testing..." : tested ? "Connection OK" : "Test Connection"}</Text>
              </Pressable>
              {qrError ? <Text style={styles.emptyText}>{qrError}</Text> : null}
            </>
          ) : null}

          {step === 2 ? (
            <>
              <Text style={styles.panelLabel}>Secure and Notify</Text>
              <View style={styles.rowInlineSpace}>
                <Text style={styles.switchLabel}>Require Face ID / Touch ID</Text>
                <Switch
                  accessibilityLabel="Require Face ID or Touch ID"
                  trackColor={{ false: "#33596c", true: "#0ea8c8" }}
                  thumbColor={requireBiometric ? "#d4fdff" : "#d3dee5"}
                  value={requireBiometric}
                  onValueChange={setRequireBiometric}
                />
              </View>

              <Pressable accessibilityRole="button" accessibilityLabel="Request notification permission" style={styles.buttonGhost} onPress={onRequestNotifications}>
                <Text style={styles.buttonGhostText}>{notificationsGranted ? "Notifications Enabled" : "Enable Notifications"}</Text>
              </Pressable>
              <Pressable accessibilityRole="button" accessibilityLabel="Request microphone permission" style={styles.buttonGhost} onPress={onRequestMicrophone}>
                <Text style={styles.buttonGhostText}>{microphoneGranted ? "Microphone Enabled" : "Enable Microphone"}</Text>
              </Pressable>

              <Text style={styles.emptyText}>
                Glasses mode and voice commands require microphone permission. You can change this later in iOS Settings.
              </Text>
              <Text style={styles.emptyText}>Tip: Tap any session card to open fullscreen controls and search output.</Text>
            </>
          ) : null}

          <View style={styles.rowInlineSpace}>
            {step > 0 ? (
              <Pressable accessibilityRole="button" accessibilityLabel="Previous onboarding step" style={[styles.buttonGhost, styles.flexButton]} onPress={() => setStep((prev) => prev - 1)}>
                <Text style={styles.buttonGhostText}>Back</Text>
              </Pressable>
            ) : null}
            {step < 2 ? (
              <Pressable accessibilityRole="button"
                accessibilityLabel="Next onboarding step"
                style={[styles.buttonPrimary, styles.flexButton, !canContinue ? styles.buttonDisabled : null]}
                disabled={!canContinue}
                onPress={() => setStep((prev) => prev + 1)}
              >
                <Text style={styles.buttonPrimaryText}>Next</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button"
                accessibilityLabel="Finish onboarding setup"
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

          const scannedServer: OnboardingServer = {
            name: parsed.name || DEFAULT_SERVER_NAME,
            url: parsed.url,
            token: parsed.token,
            cwd: parsed.cwd,
          };

          setName(scannedServer.name);
          setUrl(scannedServer.url);
          setToken(scannedServer.token);
          setCwd(scannedServer.cwd);
          setTested(false);
          setQrError("");
          setShowQrScanner(false);

          if (scannedServer.url && scannedServer.token) {
            void testConnection(scannedServer);
          }
        }}
      />
    </Modal>
  );
}

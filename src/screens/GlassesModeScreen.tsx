import React, { useEffect, useMemo, useRef, useState } from "react";
import { NativeSyntheticEvent, Pressable, ScrollView, Switch, Text, TextInput, TextInputKeyPressEventData, View } from "react-native";

import { AnsiText } from "../components/AnsiText";
import { useAppContext } from "../context/AppContext";
import { styles } from "../theme/styles";
import { GlassesBrand } from "../types";

function glassesBrandLabel(brand: GlassesBrand): string {
  if (brand === "xreal_x1") {
    return "XREAL X1";
  }
  if (brand === "halo") {
    return "Halo";
  }
  return "Custom";
}

function glassesAccent(brand: GlassesBrand): string {
  if (brand === "xreal_x1") {
    return "#27d9ff";
  }
  if (brand === "halo") {
    return "#ffd36b";
  }
  return "#87ffa4";
}

function brandPreset(brand: GlassesBrand): {
  textScale: number;
  loopCaptureMs: number;
  vadSilenceMs: number;
  wakePhrase: string;
} {
  if (brand === "halo") {
    return {
      textScale: 1.15,
      loopCaptureMs: 7600,
      vadSilenceMs: 1100,
      wakePhrase: "halo",
    };
  }
  if (brand === "custom") {
    return {
      textScale: 1,
      loopCaptureMs: 6800,
      vadSilenceMs: 900,
      wakePhrase: "nova",
    };
  }
  return {
    textScale: 1.05,
    loopCaptureMs: 6400,
    vadSilenceMs: 800,
    wakePhrase: "xreal",
  };
}

export function GlassesModeScreen() {
  const {
    openSessions,
    sessionAliases,
    tails,
    drafts,
    sendBusy,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    onSetDraft,
    onSend,
    onClearDraft,
    onSetGlassesVoiceAutoSend,
    onSetGlassesVoiceLoop,
    onSetGlassesWakePhraseEnabled,
    onSetGlassesWakePhrase,
    onSetGlassesMinimalMode,
    onSetGlassesTextScale,
    onSetGlassesVadEnabled,
    onSetGlassesVadSilenceMs,
    onSetGlassesLoopCaptureMs,
    onSetGlassesHeadsetPttEnabled,
    onVoiceStartCapture,
    onVoiceStopCapture,
    onVoiceSendTranscript,
    onCloseGlassesMode,
  } = useAppContext().terminals;

  const [activeSession, setActiveSession] = useState<string | null>(null);
  const outputRef = useRef<ScrollView | null>(null);
  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (openSessions.length === 0) {
      if (activeSession !== null) {
        setActiveSession(null);
      }
      return;
    }
    if (!activeSession || !openSessions.includes(activeSession)) {
      setActiveSession(openSessions[0]);
    }
  }, [activeSession, openSessions]);

  const accent = useMemo(() => glassesAccent(glassesMode.brand), [glassesMode.brand]);
  const sessionLabel = activeSession ? sessionAliases[activeSession]?.trim() || activeSession : "No session";
  const output = activeSession ? tails[activeSession] || "" : "";
  const draft = activeSession ? drafts[activeSession] || "" : "";
  const transcriptReady = voiceTranscript.trim().length > 0;
  const dynamicTextStyle = useMemo(
    () => ({
      fontSize: Math.max(15, Math.round(16 * glassesMode.textScale)),
      lineHeight: Math.max(21, Math.round(22 * glassesMode.textScale)),
      color: "#d9f4ff",
    }),
    [glassesMode.textScale]
  );

  const goToNextSession = () => {
    if (openSessions.length === 0) {
      return;
    }
    if (!activeSession) {
      setActiveSession(openSessions[0]);
      return;
    }
    const currentIndex = openSessions.indexOf(activeSession);
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % openSessions.length;
    setActiveSession(openSessions[nextIndex]);
  };

  const onPttKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (!glassesMode.headsetPttEnabled || !activeSession || voiceBusy) {
      return;
    }
    const key = String(event.nativeEvent.key || "").toLowerCase();
    if (key !== "enter" && key !== " " && key !== "space" && key !== "k" && key !== "headsethook") {
      return;
    }
    if (voiceRecording) {
      onVoiceStopCapture(activeSession);
      return;
    }
    onVoiceStartCapture();
  };

  useEffect(() => {
    if (!glassesMode.voiceLoop || !activeSession || !voiceRecording || voiceBusy) {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      return;
    }
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
    loopTimeoutRef.current = setTimeout(() => {
      onVoiceStopCapture(activeSession);
    }, glassesMode.loopCaptureMs);

    return () => {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [activeSession, glassesMode.loopCaptureMs, glassesMode.voiceLoop, onVoiceStopCapture, voiceBusy, voiceRecording]);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, []);

  return (
    <View style={styles.glassesRoutePanel}>
      <View style={[styles.glassesRouteHeader, { borderColor: accent }]}>
        <View style={styles.rowInlineSpace}>
          <Text style={[styles.glassesRouteTitle, { color: accent }]}>{`${glassesBrandLabel(glassesMode.brand)} On-the-Go`}</Text>
          <Pressable accessibilityRole="button" style={[styles.buttonGhost, styles.glassesRouteExit]} onPress={onCloseGlassesMode}>
            <Text style={styles.buttonGhostText}>Exit</Text>
          </Pressable>
        </View>
        <Text style={styles.serverSubtitle}>{`Active session: ${sessionLabel}`}</Text>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Minimal HUD layout</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.minimalMode ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.minimalMode}
            onValueChange={onSetGlassesMinimalMode}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          style={styles.glassesRouteButton}
          onPress={() => {
            const preset = brandPreset(glassesMode.brand);
            onSetGlassesTextScale(preset.textScale);
            onSetGlassesLoopCaptureMs(preset.loopCaptureMs);
            onSetGlassesVadSilenceMs(preset.vadSilenceMs);
            if (!glassesMode.wakePhraseEnabled || !glassesMode.wakePhrase.trim()) {
              onSetGlassesWakePhrase(preset.wakePhrase);
            }
          }}
        >
          <Text style={styles.glassesRouteButtonText}>{`Apply ${glassesBrandLabel(glassesMode.brand)} preset`}</Text>
        </Pressable>
      </View>

      {openSessions.length > 0 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {openSessions.map((session) => (
            <Pressable
              accessibilityRole="button"
              key={`glasses-route-${session}`}
              style={[styles.chip, session === activeSession ? styles.chipActive : null]}
              onPress={() => setActiveSession(session)}
            >
              <Text style={[styles.chipText, session === activeSession ? styles.chipTextActive : null]}>
                {sessionAliases[session]?.trim() || session}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      ) : (
        <Text style={styles.emptyText}>Open a terminal session and return to on-the-go mode.</Text>
      )}

      <View style={[styles.glassesRouteTerminalFrame, { borderColor: accent }]}>
        <ScrollView
          ref={outputRef}
          style={styles.glassesRouteTerminalScroll}
          onContentSizeChange={() => outputRef.current?.scrollToEnd({ animated: true })}
        >
          <AnsiText text={output || "Waiting for terminal output..."} style={[styles.terminalText, dynamicTextStyle]} />
        </ScrollView>
      </View>

      <View style={styles.glassesRouteControls}>
        <Text style={styles.glassesHudStatus}>
          {voiceRecording ? "Listening..." : voiceBusy ? "Transcribing..." : "Voice idle"}
        </Text>
        {voiceError ? <Text style={styles.emptyText}>{`Voice error: ${voiceError}`}</Text> : null}
        {transcriptReady ? <Text style={styles.serverSubtitle}>{`Transcript: ${voiceTranscript}`}</Text> : null}

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Auto-send transcript</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.voiceAutoSend ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.voiceAutoSend}
            onValueChange={onSetGlassesVoiceAutoSend}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Continuous voice loop</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.voiceLoop ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.voiceLoop}
            onValueChange={onSetGlassesVoiceLoop}
          />
        </View>
        <TextInput
          style={styles.input}
          value={String(glassesMode.loopCaptureMs)}
          onChangeText={(value) => onSetGlassesLoopCaptureMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
          placeholder="Loop capture ms (1500-30000)"
          placeholderTextColor="#7f7aa8"
          keyboardType="number-pad"
        />
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Require wake phrase</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.wakePhraseEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.wakePhraseEnabled}
            onValueChange={onSetGlassesWakePhraseEnabled}
          />
        </View>
        {glassesMode.wakePhraseEnabled ? (
          <TextInput
            style={styles.input}
            value={glassesMode.wakePhrase}
            onChangeText={onSetGlassesWakePhrase}
            placeholder="Wake phrase (example: nova)"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
          />
        ) : null}
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Server VAD assist</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.vadEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.vadEnabled}
            onValueChange={onSetGlassesVadEnabled}
          />
        </View>
        {glassesMode.vadEnabled ? (
          <TextInput
            style={styles.input}
            value={String(glassesMode.vadSilenceMs)}
            onChangeText={(value) => onSetGlassesVadSilenceMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
            placeholder="VAD silence ms (250-5000)"
            placeholderTextColor="#7f7aa8"
            keyboardType="number-pad"
          />
        ) : null}
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>BT remote push-to-talk keys</Text>
          <Switch
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.headsetPttEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.headsetPttEnabled}
            onValueChange={onSetGlassesHeadsetPttEnabled}
          />
        </View>
        {glassesMode.headsetPttEnabled ? (
          <TextInput
            style={styles.input}
            placeholder="Focus here and press Enter/Space/K on BT remote"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
            onKeyPress={onPttKeyPress}
          />
        ) : null}
        <Text style={styles.emptyText}>
          {`Loop ${glassesMode.loopCaptureMs}ms • VAD ${glassesMode.vadEnabled ? `${glassesMode.vadSilenceMs}ms` : "off"}`}
        </Text>

        {!glassesMode.minimalMode ? (
          <TextInput
            style={[styles.input, styles.multilineInput]}
            value={draft}
            onChangeText={(value) => {
              if (!activeSession) {
                return;
              }
              onSetDraft(activeSession, value);
            }}
            placeholder="Optional manual draft"
            placeholderTextColor="#7f7aa8"
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />
        ) : null}

        <View style={styles.glassesRouteActions}>
          <Pressable
            accessibilityRole="button"
            style={[styles.glassesRouteButton, voiceRecording || voiceBusy ? styles.buttonDisabled : null]}
            disabled={voiceRecording || voiceBusy || !activeSession}
            onPress={onVoiceStartCapture}
          >
            <Text style={styles.glassesRouteButtonText}>Start Voice</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.glassesRouteButton, !voiceRecording || voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={!voiceRecording || voiceBusy || !activeSession}
            onPress={() => {
              if (!activeSession) {
                return;
              }
              onVoiceStopCapture(activeSession);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>{voiceBusy ? "Transcribing..." : "Stop + Transcribe"}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.glassesRouteButton, !transcriptReady || voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={!transcriptReady || voiceBusy || !activeSession}
            onPress={() => {
              if (!activeSession) {
                return;
              }
              onVoiceSendTranscript(activeSession);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Send Transcript</Text>
          </Pressable>
          <Pressable accessibilityRole="button" style={styles.glassesRouteButton} onPress={goToNextSession} disabled={openSessions.length < 2}>
            <Text style={styles.glassesRouteButtonText}>Next Session</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={[styles.glassesRoutePrimary, !activeSession || Boolean(activeSession && sendBusy[activeSession]) ? styles.buttonDisabled : null]}
            disabled={!activeSession || Boolean(activeSession && sendBusy[activeSession])}
            onPress={() => {
              if (!activeSession) {
                return;
              }
              onSend(activeSession);
            }}
          >
            <Text style={styles.glassesRoutePrimaryText}>
              {activeSession && sendBusy[activeSession] ? "Sending..." : "Send Draft"}
            </Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.glassesRouteButton}
            onPress={() => {
              if (!activeSession) {
                return;
              }
              onClearDraft(activeSession);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Clear Draft</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

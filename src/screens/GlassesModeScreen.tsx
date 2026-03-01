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
  vadSensitivityDb: number;
  wakePhrase: string;
} {
  if (brand === "halo") {
    return {
      textScale: 1.15,
      loopCaptureMs: 7600,
      vadSilenceMs: 1100,
      vadSensitivityDb: 9,
      wakePhrase: "halo",
    };
  }
  if (brand === "custom") {
    return {
      textScale: 1,
      loopCaptureMs: 6800,
      vadSilenceMs: 900,
      vadSensitivityDb: 8,
      wakePhrase: "nova",
    };
  }
  return {
    textScale: 1.05,
    loopCaptureMs: 6400,
    vadSilenceMs: 800,
    vadSensitivityDb: 7,
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
    voiceMeteringDb,
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
    onSetGlassesVadSensitivityDb,
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
  const silenceSinceRef = useRef<number | null>(null);
  const localStopPendingRef = useRef<boolean>(false);
  const voiceStopRef = useRef(onVoiceStopCapture);
  const voiceStartRef = useRef(onVoiceStartCapture);
  const ambientFloorDbRef = useRef<number | null>(null);
  const dynamicThresholdDbRef = useRef<number | null>(null);

  useEffect(() => {
    voiceStopRef.current = onVoiceStopCapture;
  }, [onVoiceStopCapture]);

  useEffect(() => {
    voiceStartRef.current = onVoiceStartCapture;
  }, [onVoiceStartCapture]);

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
      voiceStopRef.current(activeSession);
      return;
    }
    voiceStartRef.current();
  };

  useEffect(() => {
    if (!glassesMode.voiceLoop || !activeSession || !voiceRecording || voiceBusy) {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      silenceSinceRef.current = null;
      localStopPendingRef.current = false;
      return;
    }
    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current);
      loopTimeoutRef.current = null;
    }
    loopTimeoutRef.current = setTimeout(() => {
      voiceStopRef.current(activeSession);
    }, glassesMode.loopCaptureMs);

    return () => {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
    };
  }, [activeSession, glassesMode.loopCaptureMs, glassesMode.voiceLoop, voiceBusy, voiceRecording]);

  useEffect(() => {
    if (!glassesMode.voiceLoop || !glassesMode.vadEnabled || !activeSession || !voiceRecording || voiceBusy) {
      silenceSinceRef.current = null;
      localStopPendingRef.current = false;
      ambientFloorDbRef.current = null;
      dynamicThresholdDbRef.current = null;
      return;
    }
    if (typeof voiceMeteringDb !== "number") {
      return;
    }
    const now = Date.now();
    const existingFloor = ambientFloorDbRef.current;
    const floor = existingFloor === null ? voiceMeteringDb : existingFloor;
    const alpha = voiceMeteringDb < floor ? 0.22 : 0.045;
    const nextFloor = floor + (voiceMeteringDb - floor) * alpha;
    ambientFloorDbRef.current = nextFloor;

    const adaptiveThreshold = Math.max(-60, Math.min(-18, nextFloor + glassesMode.vadSensitivityDb));
    dynamicThresholdDbRef.current = adaptiveThreshold;

    if (voiceMeteringDb > adaptiveThreshold) {
      silenceSinceRef.current = null;
      localStopPendingRef.current = false;
      return;
    }
    if (silenceSinceRef.current === null) {
      silenceSinceRef.current = now;
      return;
    }
    if (localStopPendingRef.current) {
      return;
    }
    if (now - silenceSinceRef.current >= glassesMode.vadSilenceMs) {
      localStopPendingRef.current = true;
      voiceStopRef.current(activeSession);
    }
  }, [
    activeSession,
    glassesMode.vadEnabled,
    glassesMode.vadSensitivityDb,
    glassesMode.vadSilenceMs,
    glassesMode.voiceLoop,
    voiceBusy,
    voiceMeteringDb,
    voiceRecording,
  ]);

  useEffect(() => {
    return () => {
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current);
        loopTimeoutRef.current = null;
      }
      silenceSinceRef.current = null;
      localStopPendingRef.current = false;
      ambientFloorDbRef.current = null;
      dynamicThresholdDbRef.current = null;
    };
  }, []);

  return (
    <View style={styles.glassesRoutePanel}>
      <View style={[styles.glassesRouteHeader, { borderColor: accent }]}>
        <View style={styles.rowInlineSpace}>
          <Text style={[styles.glassesRouteTitle, { color: accent }]}>{`${glassesBrandLabel(glassesMode.brand)} On-the-Go`}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Exit on-the-go glasses mode" style={[styles.buttonGhost, styles.glassesRouteExit]} onPress={onCloseGlassesMode}>
            <Text style={styles.buttonGhostText}>Exit</Text>
          </Pressable>
        </View>
        <Text style={styles.serverSubtitle}>{`Active session: ${sessionLabel}`}</Text>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Minimal HUD layout</Text>
          <Switch
            accessibilityLabel="Toggle minimal HUD layout"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.minimalMode ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.minimalMode}
            onValueChange={onSetGlassesMinimalMode}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Apply ${glassesBrandLabel(glassesMode.brand)} glasses preset`}
          accessibilityHint="Sets recommended text scale and voice timing defaults for this glasses brand."
          style={styles.glassesRouteButton}
          onPress={() => {
            const preset = brandPreset(glassesMode.brand);
            onSetGlassesTextScale(preset.textScale);
            onSetGlassesLoopCaptureMs(preset.loopCaptureMs);
            onSetGlassesVadSilenceMs(preset.vadSilenceMs);
            onSetGlassesVadSensitivityDb(preset.vadSensitivityDb);
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
              accessibilityLabel={`Select session ${sessionAliases[session]?.trim() || session}`}
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
        {voiceRecording && typeof voiceMeteringDb === "number" ? (
          <Text style={styles.emptyText}>{`Mic level ${Math.round(voiceMeteringDb)} dB`}</Text>
        ) : null}

        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Auto-send transcript</Text>
          <Switch
            accessibilityLabel="Toggle auto send transcript"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.voiceAutoSend ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.voiceAutoSend}
            onValueChange={onSetGlassesVoiceAutoSend}
          />
        </View>
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>Continuous voice loop</Text>
          <Switch
            accessibilityLabel="Toggle continuous voice loop"
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
            accessibilityLabel="Toggle wake phrase requirement"
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
            accessibilityLabel="Toggle server VAD assist"
            trackColor={{ false: "#33596c", true: "#0ea8c8" }}
            thumbColor={glassesMode.vadEnabled ? "#d4fdff" : "#d3dee5"}
            value={glassesMode.vadEnabled}
            onValueChange={onSetGlassesVadEnabled}
          />
        </View>
        {glassesMode.vadEnabled ? (
          <>
            <TextInput
              style={styles.input}
              value={String(glassesMode.vadSilenceMs)}
              onChangeText={(value) => onSetGlassesVadSilenceMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
              placeholder="VAD silence ms (250-5000)"
              placeholderTextColor="#7f7aa8"
              keyboardType="number-pad"
            />
            <TextInput
              style={styles.input}
              value={String(glassesMode.vadSensitivityDb)}
              onChangeText={(value) => onSetGlassesVadSensitivityDb(Number.parseFloat(value.replace(/[^0-9.]/g, "")) || 0)}
              placeholder="VAD sensitivity dB above ambient (2-20)"
              placeholderTextColor="#7f7aa8"
              keyboardType="decimal-pad"
            />
          </>
        ) : null}
        <View style={styles.rowInlineSpace}>
          <Text style={styles.switchLabel}>BT remote push-to-talk keys</Text>
          <Switch
            accessibilityLabel="Toggle Bluetooth push to talk keys"
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
        {glassesMode.vadEnabled && typeof dynamicThresholdDbRef.current === "number" ? (
          <Text style={styles.emptyText}>
            {`Adaptive threshold ${Math.round(dynamicThresholdDbRef.current)} dB (ambient ${Math.round(ambientFloorDbRef.current || 0)} dB)`}
          </Text>
        ) : null}

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
            accessibilityLabel="Start voice recording"
            accessibilityHint="Starts listening for your spoken command."
            style={[styles.glassesRouteButton, voiceRecording || voiceBusy ? styles.buttonDisabled : null]}
            disabled={voiceRecording || voiceBusy || !activeSession}
            onPress={onVoiceStartCapture}
          >
            <Text style={styles.glassesRouteButtonText}>Start Voice</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop voice and transcribe"
            accessibilityHint="Stops recording and sends audio for transcription."
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
            accessibilityLabel="Hold to talk"
            accessibilityHint="Press and hold to record. Releasing stops recording and transcribes."
            style={[styles.glassesRouteButton, voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={voiceBusy || !activeSession}
            onPressIn={() => {
              if (voiceRecording || !activeSession) {
                return;
              }
              voiceStartRef.current();
            }}
            onPressOut={() => {
              if (!activeSession || !voiceRecording) {
                return;
              }
              voiceStopRef.current(activeSession);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Hold to Talk</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send transcript"
            accessibilityHint="Sends the latest transcript to the active session."
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
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Switch to next session"
            accessibilityHint="Cycles to the next open terminal session."
            style={styles.glassesRouteButton}
            onPress={goToNextSession}
            disabled={openSessions.length < 2}
          >
            <Text style={styles.glassesRouteButtonText}>Next Session</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send current draft"
            accessibilityHint="Sends the current draft text to the active session."
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
            accessibilityLabel="Clear current draft"
            accessibilityHint="Clears the draft input for the active session."
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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TextInputKeyPressEventData,
  View,
} from "react-native";

import { SpatialTerminalLayout } from "../components/SpatialTerminalLayout";
import { TerminalKeyboardBar } from "../components/TerminalKeyboardBar";
import { useAppContext } from "../context/AppContext";
import { SpatialLayoutSnapshot, useSpatialLayoutPrefs } from "../hooks/useSpatialLayoutPrefs";
import { SpatialVoicePanel, useSpatialVoiceRouting } from "../hooks/useSpatialVoiceRouting";
import { buildSpatialPanels, cyclicalIndex, normalizePanelOrder, SpatialPanelCandidate } from "../spatialPanelPlanner";
import { TextEditingAction, useTextEditing } from "../hooks/useTextEditing";
import { styles } from "../theme/styles";
import { GlassesBrand } from "../types";

type BrandProfile = {
  label: string;
  accent: string;
  textScale: number;
  loopCaptureMs: number;
  vadSilenceMs: number;
  vadSensitivityDb: number;
  wakePhrase: string;
  maxPanels: number;
  spatialLayout: "balanced" | "wide";
  supportsGaze: boolean;
  supportsHandTracking: boolean;
  displayAspect: string;
};

const BRAND_PROFILES: Record<GlassesBrand, BrandProfile> = {
  xreal_x1: {
    label: "XREAL X1",
    accent: "#27d9ff",
    textScale: 1.05,
    loopCaptureMs: 6400,
    vadSilenceMs: 800,
    vadSensitivityDb: 7,
    wakePhrase: "xreal",
    maxPanels: 4,
    spatialLayout: "balanced",
    supportsGaze: false,
    supportsHandTracking: false,
    displayAspect: "16:9",
  },
  halo: {
    label: "Halo",
    accent: "#ffd36b",
    textScale: 1.15,
    loopCaptureMs: 7600,
    vadSilenceMs: 1100,
    vadSensitivityDb: 9,
    wakePhrase: "halo",
    maxPanels: 5,
    spatialLayout: "wide",
    supportsGaze: false,
    supportsHandTracking: true,
    displayAspect: "21:9",
  },
  meta_orion: {
    label: "Meta Orion",
    accent: "#6cf2a2",
    textScale: 1,
    loopCaptureMs: 6200,
    vadSilenceMs: 750,
    vadSensitivityDb: 7,
    wakePhrase: "orion",
    maxPanels: 6,
    spatialLayout: "wide",
    supportsGaze: true,
    supportsHandTracking: true,
    displayAspect: "22:9",
  },
  meta_ray_ban: {
    label: "Meta Ray-Ban",
    accent: "#6bd5ff",
    textScale: 1.1,
    loopCaptureMs: 7000,
    vadSilenceMs: 950,
    vadSensitivityDb: 8,
    wakePhrase: "meta",
    maxPanels: 3,
    spatialLayout: "balanced",
    supportsGaze: false,
    supportsHandTracking: false,
    displayAspect: "16:9",
  },
  viture_pro: {
    label: "VITURE Pro",
    accent: "#f7c76a",
    textScale: 1.05,
    loopCaptureMs: 6600,
    vadSilenceMs: 850,
    vadSensitivityDb: 7,
    wakePhrase: "viture",
    maxPanels: 5,
    spatialLayout: "wide",
    supportsGaze: false,
    supportsHandTracking: true,
    displayAspect: "21:9",
  },
  custom: {
    label: "Custom",
    accent: "#87ffa4",
    textScale: 1,
    loopCaptureMs: 6800,
    vadSilenceMs: 900,
    vadSensitivityDb: 8,
    wakePhrase: "nova",
    maxPanels: 4,
    spatialLayout: "balanced",
    supportsGaze: false,
    supportsHandTracking: false,
    displayAspect: "16:9",
  },
};

const GLASSES_BRANDS: GlassesBrand[] = [
  "xreal_x1",
  "halo",
  "meta_orion",
  "meta_ray_ban",
  "viture_pro",
  "custom",
];

export function GlassesModeScreen() {
  const {
    connections,
    focusedServerId,
    onFocusServer,
    onReconnectServer,
    sessionAliases,
    sessionReadOnly,
    glassesMode,
    voiceRecording,
    voiceBusy,
    voiceTranscript,
    voiceError,
    voiceMeteringDb,
    onSetServerSessionDraft,
    onSendServerSessionDraft,
    onSendServerSessionCommand,
    onOpenServerSessionOnMac,
    onClearServerSessionDraft,
    onSendServerSessionControlChar,
    onHistoryPrev,
    onHistoryNext,
    onSetGlassesBrand,
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
    onVoiceStopCaptureForServer,
    onVoiceSendTranscriptForServer,
    onCloseGlassesMode,
  } = useAppContext().terminals;

  const brandProfile = BRAND_PROFILES[glassesMode.brand] || BRAND_PROFILES.custom;
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [pinnedPanelIds, setPinnedPanelIds] = useState<string[]>([]);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const [overviewMode, setOverviewMode] = useState<boolean>(true);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const maxPanels = Math.max(1, Math.min(brandProfile.maxPanels, 6));

  const loopTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const silenceSinceRef = useRef<number | null>(null);
  const localStopPendingRef = useRef<boolean>(false);
  const activePanelRef = useRef<SpatialPanelCandidate | null>(null);
  const voiceStopRef = useRef<() => void>(() => {});
  const voiceStartRef = useRef(onVoiceStartCapture);
  const ambientFloorDbRef = useRef<number | null>(null);
  const dynamicThresholdDbRef = useRef<number | null>(null);
  const pendingAutoRouteRef = useRef<boolean>(false);

  useEffect(() => {
    voiceStartRef.current = onVoiceStartCapture;
  }, [onVoiceStartCapture]);

  const allPanels = useMemo(() => {
    const next: SpatialPanelCandidate[] = [];
    connections.forEach((connection, serverId) => {
      connection.openSessions.forEach((session) => {
        const alias = serverId === focusedServerId ? sessionAliases[session]?.trim() : "";
        next.push({
          id: `${serverId}::${session}`,
          serverId,
          serverName: connection.server.name,
          session,
          sessionLabel: alias || session,
          output: connection.tails[session] || "",
          draft: connection.drafts[session] || "",
          sending: Boolean(connection.sendBusy[session]),
          readOnly: serverId === focusedServerId ? Boolean(sessionReadOnly[session]) : false,
        });
      });
    });

    return next.sort((a, b) => normalizePanelOrder(a, b, focusedServerId));
  }, [connections, focusedServerId, sessionAliases, sessionReadOnly]);

  const panelMap = useMemo(() => new Map(allPanels.map((panel) => [panel.id, panel])), [allPanels]);

  useEffect(() => {
    const availableSet = new Set(allPanels.map((panel) => panel.id));
    setPinnedPanelIds((previous) => previous.filter((panelId) => availableSet.has(panelId)));
    setPanelIds((previous) => {
      const hadPanels = previous.length > 0;
      let next = previous.filter((panelId) => availableSet.has(panelId));
      if (next.length === 0 && allPanels[0]) {
        if (hadPanels) {
          next = [allPanels[0].id];
        } else {
          next = allPanels.slice(0, maxPanels).map((panel) => panel.id);
        }
      }

      if (next.length > maxPanels) {
        const pinned = next.filter((panelId) => pinnedPanelIds.includes(panelId));
        const rest = next.filter((panelId) => !pinnedPanelIds.includes(panelId));
        next = [...pinned, ...rest].slice(0, maxPanels);
      }

      return next;
    });
  }, [allPanels, brandProfile.maxPanels, pinnedPanelIds]);

  useEffect(() => {
    setFocusedPanelId((previous) => {
      if (previous && panelIds.includes(previous)) {
        return previous;
      }
      return panelIds[0] || null;
    });
  }, [panelIds]);

  useEffect(() => {
    if (!focusedPanelId) {
      return;
    }
    const panel = panelMap.get(focusedPanelId);
    if (!panel) {
      return;
    }
    if (focusedServerId !== panel.serverId) {
      onFocusServer(panel.serverId);
    }
  }, [focusedPanelId, focusedServerId, onFocusServer, panelMap]);

  const activePanel = focusedPanelId ? panelMap.get(focusedPanelId) || null : null;
  const activeSession = activePanel?.session || null;
  const transcriptReady = voiceTranscript.trim().length > 0;

  useEffect(() => {
    activePanelRef.current = activePanel;
  }, [activePanel]);

  const arrangedPanels = useMemo(
    () => buildSpatialPanels(allPanels, focusedPanelId, panelIds, pinnedPanelIds, overviewMode),
    [allPanels, focusedPanelId, panelIds, pinnedPanelIds, overviewMode]
  );

  const availablePanelChoices = useMemo(() => {
    return allPanels.filter((panel) => !panelIds.includes(panel.id));
  }, [allPanels, panelIds]);

  const routePanels = useMemo<SpatialVoicePanel[]>(
    () =>
      allPanels.map((panel) => ({
        id: panel.id,
        serverId: panel.serverId,
        serverName: panel.serverName,
        session: panel.session,
        sessionLabel: panel.sessionLabel,
      })),
    [allPanels]
  );
  const { routeTranscript } = useSpatialVoiceRouting({
    panels: routePanels,
    focusedPanelId,
  });

  const panelUniverseIds = useMemo(() => allPanels.map((panel) => panel.id), [allPanels]);
  const serverScopeIds = useMemo(
    () => Array.from(new Set(allPanels.map((panel) => panel.serverId))).sort(),
    [allPanels]
  );
  const layoutSnapshot = useMemo<SpatialLayoutSnapshot>(
    () => ({
      panelIds,
      pinnedPanelIds,
      focusedPanelId,
      overviewMode,
    }),
    [focusedPanelId, overviewMode, panelIds, pinnedPanelIds]
  );

  const restoreSpatialLayout = useCallback((snapshot: SpatialLayoutSnapshot) => {
    setPanelIds(snapshot.panelIds);
    setPinnedPanelIds(snapshot.pinnedPanelIds);
    setFocusedPanelId(snapshot.focusedPanelId);
    setOverviewMode(snapshot.overviewMode);
  }, []);

  useSpatialLayoutPrefs({
    brand: glassesMode.brand,
    serverScopeIds,
    panelUniverseIds,
    maxPanels,
    value: layoutSnapshot,
    onRestore: restoreSpatialLayout,
  });

  const applyTranscriptRoute = useCallback(
    (transcript: string, autoSend: boolean) => {
      const route = routeTranscript(transcript);
      if (route.kind === "focus_panel") {
        setFocusedPanelId(route.panelId);
        return;
      }
      if (route.kind === "show_all") {
        setOverviewMode(true);
        return;
      }
      if (route.kind === "minimize") {
        setOverviewMode(false);
        return;
      }
      if (route.kind === "rotate_workspace") {
        if (panelIds.length < 2) {
          return;
        }
        const current = focusedPanelId && panelIds.includes(focusedPanelId) ? focusedPanelId : panelIds[0];
        const currentIndex = panelIds.indexOf(current);
        const step = route.direction === "right" ? 1 : -1;
        const nextIndex = cyclicalIndex(currentIndex + step, panelIds.length);
        setFocusedPanelId(panelIds[nextIndex]);
        return;
      }
      if (route.kind === "reconnect_all") {
        const uniqueServerIds = Array.from(new Set(allPanels.map((panel) => panel.serverId)));
        uniqueServerIds.forEach((serverId) => onReconnectServer(serverId));
        return;
      }
      if (route.kind === "reconnect_server") {
        const target = panelMap.get(route.panelId);
        if (!target) {
          return;
        }
        onReconnectServer(target.serverId);
        return;
      }
      if (route.kind === "control_char") {
        const target = panelMap.get(route.panelId);
        if (!target) {
          return;
        }
        onSendServerSessionControlChar(target.serverId, target.session, route.char);
        return;
      }
      if (route.kind === "stop_session") {
        const target = panelMap.get(route.panelId);
        if (!target) {
          return;
        }
        onSendServerSessionControlChar(target.serverId, target.session, "\u0003");
        return;
      }
      if (route.kind === "open_on_mac") {
        const target = panelMap.get(route.panelId);
        if (!target) {
          return;
        }
        onOpenServerSessionOnMac(target.serverId, target.session);
        return;
      }
      if (route.kind !== "send_command") {
        return;
      }
      const target = panelMap.get(route.panelId);
      if (!target) {
        return;
      }
      onSetServerSessionDraft(target.serverId, target.session, route.command);
      if (autoSend) {
        onSendServerSessionCommand(target.serverId, target.session, route.command, "ai");
      }
    },
    [
      allPanels,
      focusedPanelId,
      onReconnectServer,
      onOpenServerSessionOnMac,
      onSendServerSessionCommand,
      onSendServerSessionControlChar,
      onSetServerSessionDraft,
      panelIds,
      panelMap,
      routeTranscript,
    ]
  );

  const stopVoiceForActivePanel = useCallback(() => {
    const panel = activePanelRef.current;
    if (!panel) {
      return;
    }
    const deferAutoRoute = glassesMode.voiceAutoSend && panelIds.length > 1;
    pendingAutoRouteRef.current = deferAutoRoute;
    onVoiceStopCaptureForServer(panel.serverId, panel.session, deferAutoRoute ? { autoSend: false } : undefined);
  }, [glassesMode.voiceAutoSend, onVoiceStopCaptureForServer, panelIds.length]);

  useEffect(() => {
    voiceStopRef.current = stopVoiceForActivePanel;
  }, [stopVoiceForActivePanel]);

  const onDraftChangeForActivePanel = useCallback(
    (value: string) => {
      if (!activePanel) {
        return;
      }
      onSetServerSessionDraft(activePanel.serverId, activePanel.session, value);
    },
    [activePanel, onSetServerSessionDraft]
  );

  const onHistoryPrevForActivePanel = useCallback(() => {
    if (!activePanel || activePanel.readOnly) {
      return;
    }
    if (focusedServerId !== activePanel.serverId) {
      onFocusServer(activePanel.serverId);
      return;
    }
    onHistoryPrev(activePanel.session);
  }, [activePanel, focusedServerId, onFocusServer, onHistoryPrev]);

  const onHistoryNextForActivePanel = useCallback(() => {
    if (!activePanel || activePanel.readOnly) {
      return;
    }
    if (focusedServerId !== activePanel.serverId) {
      onFocusServer(activePanel.serverId);
      return;
    }
    onHistoryNext(activePanel.session);
  }, [activePanel, focusedServerId, onFocusServer, onHistoryNext]);

  const {
    selection: draftSelection,
    onSelectionChange: onDraftSelectionChange,
    insertTextAtCursor: onKeyboardInsertText,
    handleAction: onKeyboardAction,
  } = useTextEditing({
    value: activePanel?.draft || "",
    onChange: onDraftChangeForActivePanel,
    disabled: !activePanel || activePanel.readOnly || activePanel.sending,
    onHistoryPrev: onHistoryPrevForActivePanel,
    onHistoryNext: onHistoryNextForActivePanel,
  });

  const cyclePanels = useCallback(
    (direction: "next" | "prev") => {
      if (panelIds.length < 2) {
        return;
      }
      const current = focusedPanelId && panelIds.includes(focusedPanelId) ? focusedPanelId : panelIds[0];
      const currentIndex = panelIds.indexOf(current);
      const step = direction === "next" ? 1 : -1;
      const nextIndex = cyclicalIndex(currentIndex + step, panelIds.length);
      setFocusedPanelId(panelIds[nextIndex]);
    },
    [focusedPanelId, panelIds]
  );

  const onPttKeyPress = (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => {
    if (!glassesMode.headsetPttEnabled || !activeSession || voiceBusy) {
      return;
    }
    const key = String(event.nativeEvent.key || "").toLowerCase();
    if (key !== "enter" && key !== " " && key !== "space" && key !== "k" && key !== "headsethook") {
      return;
    }
    if (voiceRecording) {
      voiceStopRef.current();
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
      voiceStopRef.current();
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
      voiceStopRef.current();
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
    if (!pendingAutoRouteRef.current) {
      return;
    }
    if (voiceRecording || voiceBusy) {
      return;
    }

    pendingAutoRouteRef.current = false;
    const transcript = voiceTranscript.trim();
    if (!transcript) {
      return;
    }
    applyTranscriptRoute(transcript, true);
  }, [applyTranscriptRoute, voiceBusy, voiceRecording, voiceTranscript]);

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
      <View style={[styles.glassesRouteHeader, { borderColor: brandProfile.accent }]}> 
        <View style={styles.glassesSpatialHeader}>
          <Text style={[styles.glassesRouteTitle, { color: brandProfile.accent }]}>{`${brandProfile.label} Spatial HUD`}</Text>
          <View style={styles.modeRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={settingsVisible ? "Hide spatial settings" : "Show spatial settings"}
              style={styles.glassesRouteButton}
              onPress={() => setSettingsVisible((current) => !current)}
            >
              <Text style={styles.glassesRouteButtonText}>{settingsVisible ? "Hide Settings" : "Settings"}</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Exit on-the-go glasses mode"
              style={[styles.buttonGhost, styles.glassesRouteExit]}
              onPress={onCloseGlassesMode}
            >
              <Text style={styles.buttonGhostText}>Exit</Text>
            </Pressable>
          </View>
        </View>

        <Text style={styles.serverSubtitle}>
          {`Panels ${panelIds.length}/${Math.min(6, brandProfile.maxPanels)} • Layout ${overviewMode ? "overview" : "focus"} • Aspect ${brandProfile.displayAspect}`}
        </Text>

        <View style={styles.modeRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Show panel overview"
            style={[styles.modeButton, overviewMode ? styles.modeButtonOn : null]}
            onPress={() => setOverviewMode(true)}
          >
            <Text style={[styles.modeButtonText, overviewMode ? styles.modeButtonTextOn : null]}>Show All</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Minimize to focused panel"
            style={[styles.modeButton, !overviewMode ? styles.modeButtonOn : null]}
            onPress={() => setOverviewMode(false)}
          >
            <Text style={[styles.modeButtonText, !overviewMode ? styles.modeButtonTextOn : null]}>Minimize</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Cycle to next panel"
            style={[styles.modeButton, panelIds.length < 2 ? styles.buttonDisabled : null]}
            onPress={() => cyclePanels("next")}
            disabled={panelIds.length < 2}
          >
            <Text style={styles.modeButtonText}>Next</Text>
          </Pressable>
        </View>

        <View style={settingsVisible ? styles.glassesSpatialSettings : styles.glassesSpatialSettingsHidden}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {GLASSES_BRANDS.map((brand) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Set glasses brand to ${BRAND_PROFILES[brand].label}`}
                key={`spatial-brand-${brand}`}
                style={[styles.chip, glassesMode.brand === brand ? styles.chipActive : null]}
                onPress={() => onSetGlassesBrand(brand)}
              >
                <Text style={[styles.chipText, glassesMode.brand === brand ? styles.chipTextActive : null]}>
                  {BRAND_PROFILES[brand].label}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Apply ${brandProfile.label} glasses preset`}
            style={styles.glassesRouteButton}
            onPress={() => {
              onSetGlassesTextScale(brandProfile.textScale);
              onSetGlassesLoopCaptureMs(brandProfile.loopCaptureMs);
              onSetGlassesVadSilenceMs(brandProfile.vadSilenceMs);
              onSetGlassesVadSensitivityDb(brandProfile.vadSensitivityDb);
              if (!glassesMode.wakePhraseEnabled || !glassesMode.wakePhrase.trim()) {
                onSetGlassesWakePhrase(brandProfile.wakePhrase);
              }
            }}
          >
            <Text style={styles.glassesRouteButtonText}>{`Apply ${brandProfile.label} preset`}</Text>
          </Pressable>

          <Text style={styles.emptyText}>
            {`Gaze ${brandProfile.supportsGaze ? "on" : "off"} • Hand tracking ${brandProfile.supportsHandTracking ? "on" : "off"}`}
          </Text>

          {availablePanelChoices.length > 0 ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
              {availablePanelChoices.map((panel) => (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Add panel ${panel.serverName} ${panel.sessionLabel}`}
                  key={`add-panel-${panel.id}`}
                  style={styles.chip}
                  onPress={() => {
                    setPanelIds((previous) => {
                      if (previous.includes(panel.id)) {
                        return previous;
                      }
                      const limit = Math.max(1, Math.min(brandProfile.maxPanels, 6));
                      if (previous.length < limit) {
                        return [...previous, panel.id];
                      }
                      const removable = previous.find(
                        (panelId) => panelId !== focusedPanelId && !pinnedPanelIds.includes(panelId)
                      );
                      if (!removable) {
                        return previous;
                      }
                      return previous.map((panelId) => (panelId === removable ? panel.id : panelId));
                    });
                    setFocusedPanelId(panel.id);
                  }}
                >
                  <Text style={styles.chipText}>{`+ ${panel.serverName} / ${panel.sessionLabel}`}</Text>
                </Pressable>
              ))}
            </ScrollView>
          ) : (
            <Text style={styles.emptyText}>All open sessions are already pinned to the spatial HUD.</Text>
          )}
        </View>
      </View>

      {panelIds.length > 0 ? (
        <SpatialTerminalLayout
          panels={arrangedPanels}
          onFocusPanel={(panelId) => {
            setFocusedPanelId(panelId);
          }}
          onTogglePinPanel={(panelId) => {
            setPinnedPanelIds((previous) =>
              previous.includes(panelId)
                ? previous.filter((entry) => entry !== panelId)
                : [...previous, panelId]
            );
          }}
          onRemovePanel={(panelId) => {
            setPinnedPanelIds((previous) => previous.filter((entry) => entry !== panelId));
            setPanelIds((previous) => previous.filter((entry) => entry !== panelId));
          }}
          onCyclePanel={cyclePanels}
        />
      ) : (
        <Text style={styles.emptyText}>Open terminal sessions on one or more servers to build your spatial layout.</Text>
      )}

      <View style={styles.glassesRouteControls}>
        <Text style={styles.glassesHudStatus}>{voiceRecording ? "Listening..." : voiceBusy ? "Transcribing..." : "Voice idle"}</Text>
        <Text style={styles.serverSubtitle}>
          {`Focused panel: ${activePanel ? `${activePanel.serverName} / ${activePanel.sessionLabel}` : "none"}`}
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

        <TextInput
          style={styles.input}
          value={String(glassesMode.loopCaptureMs)}
          onChangeText={(value) => onSetGlassesLoopCaptureMs(Number.parseInt(value.replace(/[^0-9]/g, ""), 10) || 0)}
          placeholder="Loop capture ms (1500-30000)"
          placeholderTextColor="#7f7aa8"
          keyboardType="number-pad"
        />

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
          <>
            <TextInput
              style={[styles.input, styles.multilineInput]}
              value={activePanel?.draft || ""}
              selection={draftSelection}
              onChangeText={onDraftChangeForActivePanel}
              onSelectionChange={onDraftSelectionChange}
              placeholder="Optional manual draft"
              placeholderTextColor="#7f7aa8"
              autoCapitalize="none"
              autoCorrect={false}
              editable={Boolean(activePanel && !activePanel.readOnly)}
              multiline
            />
            <TerminalKeyboardBar
              visible={Boolean(activePanel && !activePanel.readOnly)}
              compact
              onInsertText={onKeyboardInsertText}
              onControlChar={(value) => {
                if (!activePanel || activePanel.readOnly) {
                  return;
                }
                onSendServerSessionControlChar(activePanel.serverId, activePanel.session, value);
              }}
              onAction={(action) => onKeyboardAction(action as TextEditingAction)}
            />
          </>
        ) : null}

        <View style={styles.glassesRouteActions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Start voice recording"
            style={[styles.glassesRouteButton, voiceRecording || voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={voiceRecording || voiceBusy || !activeSession}
            onPress={onVoiceStartCapture}
          >
            <Text style={styles.glassesRouteButtonText}>Start Voice</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Stop voice and transcribe"
            style={[styles.glassesRouteButton, !voiceRecording || voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={!voiceRecording || voiceBusy || !activeSession}
            onPress={() => {
              if (!activeSession) {
                return;
              }
              voiceStopRef.current();
            }}
          >
            <Text style={styles.glassesRouteButtonText}>{voiceBusy ? "Transcribing..." : "Stop + Transcribe"}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Route transcript"
            style={[styles.glassesRouteButton, !transcriptReady ? styles.buttonDisabled : null]}
            disabled={!transcriptReady}
            onPress={() => {
              applyTranscriptRoute(voiceTranscript, glassesMode.voiceAutoSend);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Route Transcript</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send transcript"
            style={[styles.glassesRouteButton, !transcriptReady || voiceBusy || !activeSession ? styles.buttonDisabled : null]}
            disabled={!transcriptReady || voiceBusy || !activeSession}
            onPress={() => {
              if (!activePanel) {
                return;
              }
              onVoiceSendTranscriptForServer(activePanel.serverId, activePanel.session);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Send Transcript</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Hold to talk"
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
              voiceStopRef.current();
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Hold to Talk</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send current draft"
            style={[styles.glassesRoutePrimary, !activePanel || activePanel.sending ? styles.buttonDisabled : null]}
            disabled={!activePanel || activePanel.sending}
            onPress={() => {
              if (!activePanel) {
                return;
              }
              onSendServerSessionDraft(activePanel.serverId, activePanel.session);
            }}
          >
            <Text style={styles.glassesRoutePrimaryText}>{activePanel?.sending ? "Sending..." : "Send Draft"}</Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear current draft"
            style={styles.glassesRouteButton}
            onPress={() => {
              if (!activePanel) {
                return;
              }
              onClearServerSessionDraft(activePanel.serverId, activePanel.session);
            }}
          >
            <Text style={styles.glassesRouteButtonText}>Clear Draft</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

import React, { createContext, useContext } from "react";

import {
  AiEnginePreference,
  FleetRunResult,
  GlassesBrand,
  GlassesModeSettings,
  HealthMetrics,
  ProcessInfo,
  ProcessSignal,
  QueuedCommand,
  SessionCollaborator,
  SessionRecording,
  ServerCapabilities,
  ServerProfile,
  SessionConnectionMeta,
  SysStats,
  TerminalFontFamily,
  TerminalThemePresetId,
  TerminalThemeSettings,
  TerminalSendMode,
  WatchRule,
} from "../types";

export type TerminalsViewModel = {
  activeServer: ServerProfile | null;
  connected: boolean;
  servers: ServerProfile[];
  allSessions: string[];
  openSessions: string[];
  tails: Record<string, string>;
  drafts: Record<string, string>;
  sendBusy: Record<string, boolean>;
  streamLive: Record<string, boolean>;
  connectionMeta: Record<string, SessionConnectionMeta>;
  sendModes: Record<string, TerminalSendMode>;
  sessionAiEngine: Record<string, AiEnginePreference>;
  startCwd: string;
  startPrompt: string;
  startOpenOnMac: boolean;
  startKind: TerminalSendMode;
  startAiEngine: AiEnginePreference;
  capabilitiesLoading: boolean;
  health: HealthMetrics;
  capabilities: ServerCapabilities;
  supportedFeatures: string;
  sysStats: SysStats | null;
  hasExternalLlm: boolean;
  localAiSessions: string[];
  commandHistory: Record<string, string[]>;
  historyCount: Record<string, number>;
  sessionAliases: Record<string, string>;
  sessionTags: Record<string, string[]>;
  allTags: string[];
  tagFilter: string;
  pinnedSessions: string[];
  isPro: boolean;
  fleetCommand: string;
  fleetCwd: string;
  fleetTargets: string[];
  fleetBusy: boolean;
  fleetWaitMs: string;
  shellRunWaitMs: string;
  fleetResults: FleetRunResult[];
  processes: ProcessInfo[];
  processesBusy: boolean;
  sessionPresence: Record<string, SessionCollaborator[]>;
  sessionReadOnly: Record<string, boolean>;
  suggestionsBySession: Record<string, string[]>;
  suggestionBusyBySession: Record<string, boolean>;
  errorHintsBySession: Record<string, string>;
  triageBusyBySession: Record<string, boolean>;
  triageExplanationBySession: Record<string, string>;
  triageFixesBySession: Record<string, string[]>;
  watchRules: Record<string, WatchRule>;
  watchAlertHistoryBySession: Record<string, string[]>;
  terminalTheme: TerminalThemeSettings;
  commandQueue: Record<string, QueuedCommand[]>;
  recordings: Record<string, SessionRecording>;
  glassesMode: GlassesModeSettings;
  voiceRecording: boolean;
  voiceBusy: boolean;
  voiceTranscript: string;
  voiceError: string | null;
  onShowPaywall: () => void;
  onSetTagFilter: (value: string) => void;
  onSetStartCwd: (value: string) => void;
  onSetStartPrompt: (value: string) => void;
  onSetStartOpenOnMac: (value: boolean) => void;
  onSetStartKind: (value: TerminalSendMode) => void;
  onSetStartAiEngine: (value: AiEnginePreference) => void;
  onRefreshCapabilities: () => void;
  onRefreshSessions: () => void;
  onOpenServers: () => void;
  onStartSession: () => void;
  onToggleSessionVisible: (session: string) => void;
  onSetSessionMode: (session: string, mode: TerminalSendMode) => void;
  onSetSessionAiEngine: (session: string, engine: AiEnginePreference) => void;
  onOpenOnMac: (session: string) => void;
  onSyncSession: (session: string) => void;
  onExportSession: (session: string) => void;
  onFocusSession: (session: string) => void;
  onStopSession: (session: string) => void;
  onHideSession: (session: string) => void;
  onHistoryPrev: (session: string) => void;
  onHistoryNext: (session: string) => void;
  onSetTags: (session: string, raw: string) => void;
  onSetSessionAlias: (session: string, alias: string) => void;
  onAutoNameSession: (session: string) => void;
  onSetDraft: (session: string, value: string) => void;
  onAdaptDraftForBackend: (session: string) => void;
  onSend: (session: string) => void;
  onClearDraft: (session: string) => void;
  onTogglePinSession: (session: string) => void;
  onSetFleetCommand: (value: string) => void;
  onSetFleetCwd: (value: string) => void;
  onToggleFleetTarget: (serverId: string) => void;
  onSetFleetWaitMs: (value: string) => void;
  onSetShellRunWaitMs: (value: string) => void;
  onRefreshProcesses: () => void;
  onKillProcess: (pid: number, signal?: ProcessSignal) => void;
  onKillProcesses: (pids: number[], signal: ProcessSignal) => void;
  onRefreshSessionPresence: (session: string) => void;
  onSetSessionReadOnly: (session: string, value: boolean) => void;
  onRequestSuggestions: (session: string) => void;
  onUseSuggestion: (session: string, value: string) => void;
  onExplainError: (session: string) => void;
  onSuggestErrorFixes: (session: string) => void;
  onToggleWatch: (session: string, enabled: boolean) => void;
  onSetWatchPattern: (session: string, pattern: string) => void;
  onClearWatchAlerts: (session: string) => void;
  onSetTerminalPreset: (preset: TerminalThemePresetId) => void;
  onSetTerminalFontFamily: (fontFamily: TerminalFontFamily) => void;
  onSetTerminalFontSize: (fontSize: number) => void;
  onSetTerminalBackgroundOpacity: (opacity: number) => void;
  onFlushQueue: (session: string) => void;
  onRemoveQueuedCommand: (session: string, index: number) => void;
  onToggleRecording: (session: string) => void;
  onOpenPlayback: (session: string) => void;
  onDeleteRecording: (session: string) => void;
  onSetGlassesEnabled: (enabled: boolean) => void;
  onSetGlassesBrand: (brand: GlassesBrand) => void;
  onSetGlassesTextScale: (textScale: number) => void;
  onSetGlassesVoiceAutoSend: (voiceAutoSend: boolean) => void;
  onSetGlassesVoiceLoop: (voiceLoop: boolean) => void;
  onSetGlassesWakePhraseEnabled: (wakePhraseEnabled: boolean) => void;
  onSetGlassesWakePhrase: (wakePhrase: string) => void;
  onSetGlassesMinimalMode: (minimalMode: boolean) => void;
  onSetGlassesVadEnabled: (vadEnabled: boolean) => void;
  onSetGlassesVadSilenceMs: (vadSilenceMs: number) => void;
  onSetGlassesLoopCaptureMs: (loopCaptureMs: number) => void;
  onSetGlassesHeadsetPttEnabled: (enabled: boolean) => void;
  onOpenGlassesMode: () => void;
  onCloseGlassesMode: () => void;
  onVoiceStartCapture: () => void;
  onVoiceStopCapture: (session: string) => void;
  onVoiceSendTranscript: (session: string) => void;
  onRunFleet: () => void;
};

type AppContextValue = {
  terminals: TerminalsViewModel;
};

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ value, children }: { value: AppContextValue; children: React.ReactNode }) {
  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useAppContext must be used inside AppProvider.");
  }
  return context;
}

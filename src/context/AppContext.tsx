import React, { createContext, useContext } from "react";

import {
  AiEnginePreference,
  FleetRunResult,
  HealthMetrics,
  ServerCapabilities,
  ServerProfile,
  SessionConnectionMeta,
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
  health: HealthMetrics;
  capabilities: ServerCapabilities;
  supportedFeatures: string;
  hasExternalLlm: boolean;
  localAiSessions: string[];
  historyCount: Record<string, number>;
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
  fleetResults: FleetRunResult[];
  suggestionsBySession: Record<string, string[]>;
  suggestionBusyBySession: Record<string, boolean>;
  watchRules: Record<string, WatchRule>;
  terminalTheme: TerminalThemeSettings;
  onShowPaywall: () => void;
  onSetTagFilter: (value: string) => void;
  onSetStartCwd: (value: string) => void;
  onSetStartPrompt: (value: string) => void;
  onSetStartOpenOnMac: (value: boolean) => void;
  onSetStartKind: (value: TerminalSendMode) => void;
  onSetStartAiEngine: (value: AiEnginePreference) => void;
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
  onSetDraft: (session: string, value: string) => void;
  onSend: (session: string) => void;
  onClearDraft: (session: string) => void;
  onTogglePinSession: (session: string) => void;
  onSetFleetCommand: (value: string) => void;
  onSetFleetCwd: (value: string) => void;
  onToggleFleetTarget: (serverId: string) => void;
  onSetFleetWaitMs: (value: string) => void;
  onRequestSuggestions: (session: string) => void;
  onUseSuggestion: (session: string, value: string) => void;
  onToggleWatch: (session: string, enabled: boolean) => void;
  onSetWatchPattern: (session: string, pattern: string) => void;
  onSetTerminalPreset: (preset: TerminalThemePresetId) => void;
  onSetTerminalFontFamily: (fontFamily: TerminalFontFamily) => void;
  onSetTerminalFontSize: (fontSize: number) => void;
  onSetTerminalBackgroundOpacity: (opacity: number) => void;
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

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
import { resolveGlassesScopeRoute } from "../glassesScopeRouting";
import { SpatialLayoutSnapshot, useSpatialLayoutPrefs } from "../hooks/useSpatialLayoutPrefs";
import { SpatialVoicePanel, useSpatialVoiceRouting } from "../hooks/useSpatialVoiceRouting";
import { useSharedWorkspaces } from "../hooks/useSharedWorkspaces";
import { useVoiceChannels } from "../hooks/useVoiceChannels";
import {
  buildSpatialPanels,
  cyclicalIndex,
  ensurePanelVisible,
  normalizePanelOrder,
  SpatialPanelCandidate,
} from "../spatialPanelPlanner";
import { TextEditingAction, useTextEditing } from "../hooks/useTextEditing";
import { styles } from "../theme/styles";
import { GlassesBrand } from "../types";
import { getWorkspacePermissions } from "../workspacePermissions";

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

function sameStringArray(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) {
      return false;
    }
  }
  return true;
}

function normalizeToken(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function GlassesModeScreen() {
  const {
    connections,
    focusedServerId,
    onFocusServer,
    onReconnectServer,
    onReconnectServers,
    onConnectAllServers,
    onDisconnectAllServers,
    onCreateAgentForServer,
    onSetAgentGoalForServer,
    onCreateAgentForServers,
    onSetAgentGoalForServers,
    onQueueAgentCommandForServer,
    onQueueAgentCommandForServers,
    onApproveReadyAgentsForServer,
    onDenyAllPendingAgentsForServer,
    onApproveReadyAgentsForServers,
    onDenyAllPendingAgentsForServers,
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
    onOpenVrCommandCenter,
    onVoiceStartCapture,
    onVoiceStopCaptureForServer,
    onVoiceSendTranscriptForServer,
    onCloseGlassesMode,
  } = useAppContext().terminals;

  const brandProfile = BRAND_PROFILES[glassesMode.brand] || BRAND_PROFILES.custom;
  const { workspaces: sharedWorkspaces } = useSharedWorkspaces();
  const {
    channels: voiceChannels,
    createChannel,
    deleteChannel,
    joinChannel,
    leaveChannel,
    toggleMute,
  } = useVoiceChannels();
  const [panelIds, setPanelIds] = useState<string[]>([]);
  const [pinnedPanelIds, setPinnedPanelIds] = useState<string[]>([]);
  const [focusedPanelId, setFocusedPanelId] = useState<string | null>(null);
  const [overviewMode, setOverviewMode] = useState<boolean>(true);
  const [settingsVisible, setSettingsVisible] = useState<boolean>(false);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [activeVmHostScope, setActiveVmHostScope] = useState<string | null>(null);
  const [routeStatus, setRouteStatus] = useState<string | null>(null);
  const [newChannelNamesByWorkspace, setNewChannelNamesByWorkspace] = useState<Record<string, string>>({});
  const maxPanels = Math.max(1, Math.min(brandProfile.maxPanels, 6));

  const vmHostScopeOptions = useMemo(() => {
    const labels = new Map<string, string>();
    let hasStandalone = false;
    connections.forEach((connection) => {
      const host = (connection.server.vmHost || "").trim();
      if (!host) {
        hasStandalone = true;
        return;
      }
      labels.set(host.toLowerCase(), host);
    });
    const options = Array.from(labels.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
    if (hasStandalone) {
      options.push({ key: "__none__", label: "Standalone" });
    }
    return options;
  }, [connections]);

  const matchesVmHostScope = useCallback(
    (serverId: string) => {
      if (!activeVmHostScope) {
        return true;
      }
      const connection = connections.get(serverId);
      const host = (connection?.server.vmHost || "").trim().toLowerCase();
      if (activeVmHostScope === "__none__") {
        return !host;
      }
      return host === activeVmHostScope;
    },
    [activeVmHostScope, connections]
  );

  const workspaceScope = useMemo(() => {
    if (!activeWorkspaceId) {
      return null;
    }
    const workspace = sharedWorkspaces.find((entry) => entry.id === activeWorkspaceId);
    if (!workspace) {
      return null;
    }
    return {
      id: workspace.id,
      name: workspace.name,
      serverIds: new Set(workspace.serverIds),
    };
  }, [activeWorkspaceId, sharedWorkspaces]);
  const workspaceById = useMemo(() => {
    return new Map(sharedWorkspaces.map((workspace) => [workspace.id, workspace]));
  }, [sharedWorkspaces]);
  const voiceChannelsByWorkspace = useMemo(() => {
    const grouped = new Map<string, typeof voiceChannels>();
    voiceChannels.forEach((channel) => {
      const existing = grouped.get(channel.workspaceId);
      if (existing) {
        existing.push(channel);
        return;
      }
      grouped.set(channel.workspaceId, [channel]);
    });
    return grouped;
  }, [voiceChannels]);
  const visibleVoiceWorkspaces = useMemo(() => {
    if (activeWorkspaceId) {
      const scoped = workspaceById.get(activeWorkspaceId);
      return scoped ? [scoped] : [];
    }
    return sharedWorkspaces;
  }, [activeWorkspaceId, sharedWorkspaces, workspaceById]);
  const setWorkspaceChannelDraft = useCallback((workspaceId: string, value: string) => {
    setNewChannelNamesByWorkspace((previous) => ({
      ...previous,
      [workspaceId]: value,
    }));
  }, []);
  const clearWorkspaceChannelDraft = useCallback((workspaceId: string) => {
    setNewChannelNamesByWorkspace((previous) => {
      if (!(workspaceId in previous)) {
        return previous;
      }
      const next = { ...previous };
      delete next[workspaceId];
      return next;
    });
  }, []);

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
      if (!matchesVmHostScope(serverId)) {
        return;
      }
      if (workspaceScope && !workspaceScope.serverIds.has(serverId)) {
        return;
      }
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
  }, [connections, focusedServerId, matchesVmHostScope, sessionAliases, sessionReadOnly, workspaceScope]);

  const panelMap = useMemo(() => new Map(allPanels.map((panel) => [panel.id, panel])), [allPanels]);

  useEffect(() => {
    const availableSet = new Set(allPanels.map((panel) => panel.id));
    setPinnedPanelIds((previous) => {
      const next = previous.filter((panelId) => availableSet.has(panelId));
      return sameStringArray(previous, next) ? previous : next;
    });
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

      return sameStringArray(previous, next) ? previous : next;
    });
  }, [allPanels, maxPanels, pinnedPanelIds]);

  useEffect(() => {
    setFocusedPanelId((previous) => {
      if (previous && panelIds.includes(previous)) {
        return previous;
      }
      return panelIds[0] || null;
    });
  }, [panelIds]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      return;
    }
    if (!sharedWorkspaces.some((workspace) => workspace.id === activeWorkspaceId)) {
      setActiveWorkspaceId(null);
    }
  }, [activeWorkspaceId, sharedWorkspaces]);

  useEffect(() => {
    if (!activeVmHostScope) {
      return;
    }
    if (!vmHostScopeOptions.some((option) => option.key === activeVmHostScope)) {
      setActiveVmHostScope(null);
    }
  }, [activeVmHostScope, vmHostScopeOptions]);

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
      allPanels.map((panel) => {
        const serverMeta = connections.get(panel.serverId)?.server;
        return {
          id: panel.id,
          serverId: panel.serverId,
          serverName: panel.serverName,
          vmHost: serverMeta?.vmHost,
          vmType: serverMeta?.vmType,
          vmName: serverMeta?.vmName,
          vmId: serverMeta?.vmId,
          session: panel.session,
          sessionLabel: panel.sessionLabel,
        };
      }),
    [allPanels, connections]
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
      const scopeRoute = resolveGlassesScopeRoute({
        transcript,
        workspaces: sharedWorkspaces.map((workspace) => ({ id: workspace.id, name: workspace.name })),
        vmHostScopeOptions,
      });
      if (scopeRoute.kind === "set_workspace_scope") {
        setActiveWorkspaceId(scopeRoute.workspaceId);
        const label = scopeRoute.workspaceId ? workspaceById.get(scopeRoute.workspaceId)?.name || "selected workspace" : "all servers";
        setRouteStatus(`Scoped workspace to ${label}.`);
        return;
      }
      if (scopeRoute.kind === "set_vm_host_scope") {
        setActiveVmHostScope(scopeRoute.vmHostScope);
        const label = scopeRoute.vmHostScope
          ? vmHostScopeOptions.find((option) => option.key === scopeRoute.vmHostScope)?.label || scopeRoute.vmHostScope
          : "all hosts";
        setRouteStatus(`Scoped VM host to ${label}.`);
        return;
      }

      const manageChannelMatch = transcript.match(
        /^(create|add|delete|remove)\s+(?:voice\s+)?channel\s+(.+?)(?:\s+in\s+(.+))?$/i
      );
      if (manageChannelMatch) {
        const action = (manageChannelMatch[1] || "").toLowerCase();
        const channelName = (manageChannelMatch[2] || "").trim();
        const requestedWorkspaceLabel = normalizeToken(manageChannelMatch[3] || "");
        const requestedWorkspace =
          requestedWorkspaceLabel.length > 0
            ? sharedWorkspaces.find((workspace) => {
                const normalizedName = normalizeToken(workspace.name);
                return (
                  normalizedName === requestedWorkspaceLabel ||
                  normalizedName.includes(requestedWorkspaceLabel) ||
                  requestedWorkspaceLabel.includes(normalizedName)
                );
              }) || null
            : null;
        const targetWorkspace =
          requestedWorkspace ||
          (activeWorkspaceId ? workspaceById.get(activeWorkspaceId) || null : null) ||
          (sharedWorkspaces.length === 1 ? sharedWorkspaces[0] : null);
        if (!targetWorkspace) {
          setRouteStatus(
            sharedWorkspaces.length > 1
              ? "Specify a workspace or scope to one workspace before channel management."
              : "No workspace available for channel management."
          );
          return;
        }

        const workspacePermissions = getWorkspacePermissions(targetWorkspace);
        if (!workspacePermissions.canManageChannels) {
          setRouteStatus(`Channel management is blocked for ${targetWorkspace.name}.`);
          return;
        }

        if (action === "create" || action === "add") {
          const existing = voiceChannels.find(
            (channel) =>
              channel.workspaceId === targetWorkspace.id &&
              normalizeToken(channel.name) === normalizeToken(channelName)
          );
          if (existing) {
            setRouteStatus(`#${existing.name} already exists in ${targetWorkspace.name}.`);
            return;
          }
          createChannel({
            workspaceId: targetWorkspace.id,
            name: channelName,
          });
          setRouteStatus(`Created #${channelName} in ${targetWorkspace.name}`);
          return;
        }

        const channelToDelete = voiceChannels.find(
          (channel) =>
            channel.workspaceId === targetWorkspace.id &&
            (normalizeToken(channel.name) === normalizeToken(channelName) ||
              normalizeToken(channel.name).includes(normalizeToken(channelName)) ||
              normalizeToken(channelName).includes(normalizeToken(channel.name)))
        );
        if (!channelToDelete) {
          setRouteStatus(`No channel named "${channelName}" found in ${targetWorkspace.name}.`);
          return;
        }
        deleteChannel(channelToDelete.id);
        setRouteStatus(`Deleted #${channelToDelete.name} from ${targetWorkspace.name}`);
        return;
      }

      const channelMatch = transcript.match(/^(join|leave|mute|unmute)\s+(?:voice\s+)?channel(?:\s+(.+))?$/i);
      if (channelMatch) {
        const action = (channelMatch[1] || "").toLowerCase();
        const targetName = normalizeToken(channelMatch[2] || "");
        const scopedChannels = activeWorkspaceId
          ? voiceChannels.filter((channel) => channel.workspaceId === activeWorkspaceId)
          : voiceChannels;
        const candidates = scopedChannels.length > 0 ? scopedChannels : voiceChannels;
        const joinedChannels = candidates.filter((channel) => channel.joined);
        const resolveChannel = () => {
          if (targetName) {
            const exact = candidates.find((channel) => normalizeToken(channel.name) === targetName);
            if (exact) {
              return exact;
            }
            return (
              candidates.find((channel) => normalizeToken(channel.name).includes(targetName)) ||
              candidates.find((channel) => targetName.includes(normalizeToken(channel.name))) ||
              null
            );
          }
          if (action === "join") {
            return candidates[0] || null;
          }
          return joinedChannels[0] || null;
        };

        const target = resolveChannel();
        if (!target) {
          setRouteStatus(targetName ? `No channel found for "${targetName}".` : "No matching channel available.");
          return;
        }
        const workspace = workspaceById.get(target.workspaceId);
        if (workspace && !getWorkspacePermissions(workspace).canJoinChannels) {
          setRouteStatus(`Channel access blocked for ${workspace.name}.`);
          return;
        }

        if (action === "join") {
          joinChannel(target.id);
          setRouteStatus(`Joined #${target.name}`);
        } else if (action === "leave") {
          leaveChannel(target.id);
          setRouteStatus(`Left #${target.name}`);
        } else if (action === "mute") {
          if (!target.muted) {
            toggleMute(target.id);
          }
          setRouteStatus(`Muted #${target.name}`);
        } else if (action === "unmute") {
          if (target.muted) {
            toggleMute(target.id);
          }
          setRouteStatus(`Unmuted #${target.name}`);
        }
        return;
      }

      setRouteStatus(null);
      const route = routeTranscript(transcript);
      const resolveAgentTargetServerIds = (panelId?: string): string[] => {
        if (panelId) {
          const target = panelMap.get(panelId);
          return target ? [target.serverId] : [];
        }
        const focusedPanel = focusedPanelId ? panelMap.get(focusedPanelId) || null : null;
        if (focusedPanel) {
          return [focusedPanel.serverId];
        }
        if (focusedServerId && connections.has(focusedServerId)) {
          return [focusedServerId];
        }
        const firstServerId = Array.from(connections.keys())[0];
        return firstServerId ? [firstServerId] : [];
      };
      if (route.kind === "focus_panel") {
        setPanelIds((previous) => ensurePanelVisible(previous, pinnedPanelIds, route.panelId, maxPanels));
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
        if (uniqueServerIds.length === 0) {
          return;
        }
        onReconnectServers(uniqueServerIds);
        return;
      }
      if (route.kind === "create_agent") {
        if (route.allServers) {
          const serverIds = Array.from(connections.keys());
          if (serverIds.length === 0) {
            return;
          }
          void onCreateAgentForServers(serverIds, route.name).catch(() => {});
          return;
        }
        const serverIds = resolveAgentTargetServerIds(route.panelId);
        if (serverIds.length === 0) {
          return;
        }
        if (serverIds.length === 1) {
          void onCreateAgentForServer(serverIds[0], route.name).catch(() => {});
          return;
        }
        void onCreateAgentForServers(serverIds, route.name).catch(() => {});
        return;
      }
      if (route.kind === "set_agent_goal") {
        if (route.allServers) {
          const serverIds = Array.from(connections.keys());
          if (serverIds.length === 0) {
            return;
          }
          void onSetAgentGoalForServers(serverIds, route.name, route.goal).catch(() => {});
          return;
        }
        const serverIds = resolveAgentTargetServerIds(route.panelId);
        if (serverIds.length === 0) {
          return;
        }
        if (serverIds.length === 1) {
          void onSetAgentGoalForServer(serverIds[0], route.name, route.goal).catch(() => {});
          return;
        }
        void onSetAgentGoalForServers(serverIds, route.name, route.goal).catch(() => {});
        return;
      }
      if (route.kind === "queue_agent_command") {
        if (route.allServers) {
          const serverIds = Array.from(connections.keys());
          if (serverIds.length === 0) {
            return;
          }
          void onQueueAgentCommandForServers(serverIds, route.name, route.command).catch(() => {});
          return;
        }
        const serverIds = resolveAgentTargetServerIds(route.panelId);
        if (serverIds.length === 0) {
          return;
        }
        if (serverIds.length === 1) {
          void onQueueAgentCommandForServer(serverIds[0], route.name, route.command).catch(() => {});
          return;
        }
        void onQueueAgentCommandForServers(serverIds, route.name, route.command).catch(() => {});
        return;
      }
      if (route.kind === "approve_ready_agents") {
        if (!route.panelId) {
          const serverIds = Array.from(connections.keys());
          if (serverIds.length === 0) {
            return;
          }
          void onApproveReadyAgentsForServers(serverIds).catch(() => {});
          return;
        }
        const targetServerId = panelMap.get(route.panelId)?.serverId || null;
        if (!targetServerId) {
          return;
        }
        void onApproveReadyAgentsForServer(targetServerId).catch(() => {});
        return;
      }
      if (route.kind === "deny_all_pending_agents") {
        if (!route.panelId) {
          const serverIds = Array.from(connections.keys());
          if (serverIds.length === 0) {
            return;
          }
          void onDenyAllPendingAgentsForServers(serverIds).catch(() => {});
          return;
        }
        const targetServerId = panelMap.get(route.panelId)?.serverId || null;
        if (!targetServerId) {
          return;
        }
        void onDenyAllPendingAgentsForServer(targetServerId).catch(() => {});
        return;
      }
      if (route.kind === "pause_pool") {
        onDisconnectAllServers();
        return;
      }
      if (route.kind === "resume_pool") {
        onConnectAllServers();
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
      connections,
      focusedPanelId,
      focusedServerId,
      onConnectAllServers,
      onCreateAgentForServer,
      onSetAgentGoalForServer,
      onCreateAgentForServers,
      onSetAgentGoalForServers,
      onQueueAgentCommandForServer,
      onQueueAgentCommandForServers,
      onDisconnectAllServers,
      onApproveReadyAgentsForServer,
      onDenyAllPendingAgentsForServer,
      onApproveReadyAgentsForServers,
      onDenyAllPendingAgentsForServers,
      onReconnectServer,
      onReconnectServers,
      onOpenServerSessionOnMac,
      onSendServerSessionCommand,
      onSendServerSessionControlChar,
      onSetServerSessionDraft,
      panelIds,
      panelMap,
      pinnedPanelIds,
      routeTranscript,
      sharedWorkspaces,
      activeWorkspaceId,
      createChannel,
      deleteChannel,
      joinChannel,
      leaveChannel,
      maxPanels,
      vmHostScopeOptions,
      toggleMute,
      voiceChannels,
      workspaceById,
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
              accessibilityLabel="Open VR command center"
              style={styles.glassesRouteButton}
              onPress={onOpenVrCommandCenter}
            >
              <Text style={styles.glassesRouteButtonText}>Open VR</Text>
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
          {`Panels ${panelIds.length}/${Math.min(6, brandProfile.maxPanels)} • Layout ${overviewMode ? "overview" : "focus"} • Workspace ${workspaceScope?.name || "all"} • Host ${activeVmHostScope ? vmHostScopeOptions.find((option) => option.key === activeVmHostScope)?.label || activeVmHostScope : "all"} • Aspect ${brandProfile.displayAspect}`}
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

          <Text style={styles.serverSubtitle}>Workspace scope</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show glasses panels for all servers"
              style={[styles.chip, activeWorkspaceId === null ? styles.chipActive : null]}
              onPress={() => setActiveWorkspaceId(null)}
            >
              <Text style={[styles.chipText, activeWorkspaceId === null ? styles.chipTextActive : null]}>All servers</Text>
            </Pressable>
            {sharedWorkspaces.map((workspace) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Scope glasses panels to workspace ${workspace.name}`}
                key={`glasses-workspace-scope-${workspace.id}`}
                style={[styles.chip, activeWorkspaceId === workspace.id ? styles.chipActive : null]}
                onPress={() => setActiveWorkspaceId(workspace.id)}
              >
                <Text style={[styles.chipText, activeWorkspaceId === workspace.id ? styles.chipTextActive : null]}>
                  {workspace.name}
                </Text>
              </Pressable>
            ))}
          </ScrollView>

          <Text style={styles.serverSubtitle}>VM host scope</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Show glasses panels for all VM hosts"
              style={[styles.chip, activeVmHostScope === null ? styles.chipActive : null]}
              onPress={() => setActiveVmHostScope(null)}
            >
              <Text style={[styles.chipText, activeVmHostScope === null ? styles.chipTextActive : null]}>All hosts</Text>
            </Pressable>
            {vmHostScopeOptions.map((option) => (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Scope glasses panels to VM host ${option.label}`}
                key={`glasses-vmhost-scope-${option.key}`}
                style={[styles.chip, activeVmHostScope === option.key ? styles.chipActive : null]}
                onPress={() => setActiveVmHostScope(option.key)}
              >
                <Text style={[styles.chipText, activeVmHostScope === option.key ? styles.chipTextActive : null]}>
                  {option.label}
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
        {routeStatus ? <Text style={styles.emptyText}>{routeStatus}</Text> : null}
        <Text style={styles.serverSubtitle}>Workspace channels</Text>
        {visibleVoiceWorkspaces.length === 0 ? (
          <Text style={styles.emptyText}>No workspaces available.</Text>
        ) : null}
        {visibleVoiceWorkspaces.map((workspace) => {
          const channels = voiceChannelsByWorkspace.get(workspace.id) || [];
          const joined = channels.find((channel) => channel.joined) || null;
          const permissions = getWorkspacePermissions(workspace);
          const draft = (newChannelNamesByWorkspace[workspace.id] || "").trim();
          return (
            <View key={`glasses-workspace-channel-${workspace.id}`} style={styles.serverCard}>
              <Text style={styles.serverSubtitle}>{`${workspace.name} • ${permissions.role}`}</Text>
              {permissions.canManageChannels ? (
                <View style={styles.modeRow}>
                  <TextInput
                    accessibilityLabel={`New glasses voice channel for ${workspace.name}`}
                    style={[styles.input, styles.flexButton]}
                    value={newChannelNamesByWorkspace[workspace.id] || ""}
                    onChangeText={(value) => setWorkspaceChannelDraft(workspace.id, value)}
                    placeholder="New channel"
                    placeholderTextColor="#7f7aa8"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Create glasses voice channel for ${workspace.name}`}
                    style={[styles.actionButton, !draft ? styles.buttonDisabled : null]}
                    disabled={!draft}
                    onPress={() => {
                      if (!draft) {
                        return;
                      }
                      const created = createChannel({
                        workspaceId: workspace.id,
                        name: draft,
                      });
                      if (created) {
                        clearWorkspaceChannelDraft(workspace.id);
                        setRouteStatus(`Created #${created.name} in ${workspace.name}`);
                      }
                    }}
                  >
                    <Text style={styles.actionButtonText}>Create</Text>
                  </Pressable>
                </View>
              ) : null}
              {channels.length === 0 ? <Text style={styles.emptyText}>No channels configured.</Text> : null}
              {channels.length > 0 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {channels.map((channel) => {
                    const active = channel.joined;
                    return (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`${active ? "Leave" : "Join"} glasses voice channel ${channel.name}`}
                        key={`glasses-channel-${workspace.id}-${channel.id}`}
                        style={[styles.chip, active ? styles.chipActive : null, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                        disabled={!permissions.canJoinChannels}
                        onPress={() => {
                          if (!permissions.canJoinChannels) {
                            return;
                          }
                          if (active) {
                            leaveChannel(channel.id);
                            setRouteStatus(`Left #${channel.name}`);
                            return;
                          }
                          joinChannel(channel.id);
                          setRouteStatus(`Joined #${channel.name}`);
                        }}
                      >
                        <Text style={[styles.chipText, active ? styles.chipTextActive : null]}>
                          {`#${channel.name}${channel.muted ? " (muted)" : ""}`}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
              {permissions.canManageChannels && channels.length > 0 ? (
                <View style={styles.actionsWrap}>
                  {channels.map((channel) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete glasses voice channel ${channel.name}`}
                      key={`glasses-delete-channel-${workspace.id}-${channel.id}`}
                      style={styles.actionDangerButton}
                      onPress={() => {
                        deleteChannel(channel.id);
                        setRouteStatus(`Deleted #${channel.name} from ${workspace.name}`);
                      }}
                    >
                      <Text style={styles.actionDangerText}>{`Delete #${channel.name}`}</Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
              {joined ? (
                <View style={styles.modeRow}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${joined.muted ? "Unmute" : "Mute"} glasses joined channel ${joined.name}`}
                    style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                    disabled={!permissions.canJoinChannels}
                    onPress={() => {
                      if (!permissions.canJoinChannels) {
                        return;
                      }
                      toggleMute(joined.id);
                      setRouteStatus(`${joined.muted ? "Unmuted" : "Muted"} #${joined.name}`);
                    }}
                  >
                    <Text style={styles.actionButtonText}>{joined.muted ? "Unmute" : "Mute"}</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Leave glasses joined channel ${joined.name}`}
                    style={[styles.actionButton, !permissions.canJoinChannels ? styles.buttonDisabled : null]}
                    disabled={!permissions.canJoinChannels}
                    onPress={() => {
                      if (!permissions.canJoinChannels) {
                        return;
                      }
                      leaveChannel(joined.id);
                      setRouteStatus(`Left #${joined.name}`);
                    }}
                  >
                    <Text style={styles.actionButtonText}>Leave</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          );
        })}
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

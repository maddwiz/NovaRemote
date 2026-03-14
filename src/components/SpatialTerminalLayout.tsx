import React, { useMemo } from "react";
import { PanResponder, ScrollView, Text, View } from "react-native";
import { FeedbackPressable as Pressable } from "./FeedbackPressable";

import { styles } from "../theme/styles";
import { AnsiText } from "./AnsiText";

export type SpatialPanelPosition = "left" | "center" | "right" | "above" | "below";

export type SpatialPanel = {
  id: string;
  serverId: string;
  serverName: string;
  session: string;
  sessionLabel: string;
  position: SpatialPanelPosition;
  pinned: boolean;
  focused: boolean;
  output: string;
  scale: number;
};

type SpatialTerminalLayoutProps = {
  panels: SpatialPanel[];
  fullscreenPanelId?: string | null;
  onFocusPanel: (panelId: string) => void;
  onTogglePinPanel: (panelId: string) => void;
  onRemovePanel: (panelId: string) => void;
  onCyclePanel: (direction: "next" | "prev") => void;
};

function panelShellStyle(position: SpatialPanelPosition, focused: boolean, scale: number, fullscreen: boolean) {
  const normalizedScale = Number.isFinite(scale) ? Math.max(0.5, Math.min(scale, 2)) : 1;
  const scaledStyle = normalizedScale === 1 ? null : { transform: [{ scale: normalizedScale }] };
  if (fullscreen) {
    return [styles.spatialPanel, styles.spatialPanelFullscreen, focused ? styles.spatialPanelFocused : null, scaledStyle];
  }
  if (position === "center") {
    return [styles.spatialPanel, styles.spatialPanelCenter, focused ? styles.spatialPanelFocused : null, scaledStyle];
  }
  if (position === "left" || position === "right") {
    return [styles.spatialPanel, styles.spatialPanelSide, focused ? styles.spatialPanelFocused : null, scaledStyle];
  }
  return [styles.spatialPanel, styles.spatialPanelEdge, focused ? styles.spatialPanelFocused : null, scaledStyle];
}

export function SpatialTerminalLayout({
  panels,
  fullscreenPanelId = null,
  onFocusPanel,
  onTogglePinPanel,
  onRemovePanel,
  onCyclePanel,
}: SpatialTerminalLayoutProps) {
  const byPosition = useMemo(() => {
    const next: Partial<Record<SpatialPanelPosition, SpatialPanel>> = {};
    panels.forEach((panel) => {
      next[panel.position] = panel;
    });
    return next;
  }, [panels]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gestureState) =>
          Math.abs(gestureState.dx) > 12 && Math.abs(gestureState.dy) < 20,
        onPanResponderRelease: (_event, gestureState) => {
          if (Math.abs(gestureState.dx) < 36 || Math.abs(gestureState.dx) < Math.abs(gestureState.dy)) {
            return;
          }
          if (gestureState.dx < 0) {
            onCyclePanel("next");
            return;
          }
          onCyclePanel("prev");
        },
      }),
    [onCyclePanel]
  );

  const renderPanel = (panel: SpatialPanel | undefined, fullscreen: boolean = false) => {
    if (!panel) {
      return <View style={[styles.spatialPanel, styles.spatialPanelEmpty]} />;
    }

    const output = panel.output.split("\n").slice(-80).join("\n");
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Focus ${panel.serverName} ${panel.sessionLabel}`}
        style={panelShellStyle(panel.position, panel.focused, panel.scale, fullscreen)}
        onPress={() => onFocusPanel(panel.id)}
        onLongPress={() => onTogglePinPanel(panel.id)}
      >
        <View style={styles.spatialPanelHeader}>
          <View style={styles.spatialPanelHeaderMeta}>
            <Text style={styles.spatialPanelServer} numberOfLines={1}>
              {panel.serverName}
            </Text>
            <Text style={styles.spatialPanelSession} numberOfLines={1}>
              {panel.sessionLabel}
            </Text>
          </View>
          <View style={styles.spatialPanelHeaderActions}>
            {panel.pinned ? <Text style={styles.modePill}>PIN</Text> : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Remove panel ${panel.sessionLabel}`}
              style={styles.spatialPanelAction}
              onPress={() => onRemovePanel(panel.id)}
            >
              <Text style={styles.spatialPanelActionText}>x</Text>
            </Pressable>
          </View>
        </View>
        <ScrollView style={styles.spatialPanelOutput} showsVerticalScrollIndicator={false}>
          <AnsiText text={output || "Waiting for output..."} style={styles.terminalText} />
        </ScrollView>
      </Pressable>
    );
  };

  if (fullscreenPanelId) {
    const fullscreenPanel = panels.find((panel) => panel.id === fullscreenPanelId);
    if (fullscreenPanel) {
      return <View style={styles.spatialLayoutFullscreen}>{renderPanel(fullscreenPanel, true)}</View>;
    }
  }

  return (
    <View style={styles.spatialLayout} {...panResponder.panHandlers}>
      <View style={styles.spatialLayoutEdgeRow}>{renderPanel(byPosition.above)}</View>
      <View style={styles.spatialLayoutMiddle}>
        <View style={styles.spatialLayoutWing}>{renderPanel(byPosition.left)}</View>
        <View style={styles.spatialLayoutCore}>{renderPanel(byPosition.center)}</View>
        <View style={styles.spatialLayoutWing}>{renderPanel(byPosition.right)}</View>
      </View>
      <View style={styles.spatialLayoutEdgeRow}>{renderPanel(byPosition.below)}</View>
    </View>
  );
}

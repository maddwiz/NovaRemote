import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Modal,
  Pressable,
  ScrollView,
  Switch,
  Text,
  View,
} from "react-native";

import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type PageMenuSection = {
  id: string;
  title: string;
  description: string;
  render: () => React.ReactNode;
};

type PageSlideMenuProps = {
  visible: boolean;
  route: RouteTab;
  onClose: () => void;
  onGoHome: () => void;
  onNavigate: (route: RouteTab) => void;
  poolLifecyclePaused: boolean;
  onTogglePoolLifecycle: () => void;
  onRefreshAll: () => void;
  onReconnectAll: () => void;
  onCreateShell: () => void;
  onCreateAi: () => void;
  tokenMasked: boolean;
  onToggleTokenMask: () => void;
  includeHidden: boolean;
  onToggleIncludeHidden: (next: boolean) => void;
  tailLines: string;
  onSetTailLines: (next: string) => void;
};

function routeTitle(route: RouteTab): string {
  const titles: Record<RouteTab, string> = {
    terminals: "Terminals",
    servers: "Servers",
    snippets: "Snippets",
    files: "Files",
    llms: "Nova",
    team: "Team",
    glasses: "Glasses",
    vr: "VR",
  };
  return titles[route];
}

function routeDescription(route: RouteTab): string {
  const descriptions: Record<RouteTab, string> = {
    terminals: "Launch sessions, manage the pool, and move fast without opening utility clutter.",
    servers: "Tune connection security, switch targets, and control your remote machine lane.",
    snippets: "Keep reusable flows and quick actions close without crowding the main screen.",
    files: "Browse remote code, tail output, and adjust file visibility from one focused surface.",
    llms: "Configure Nova, providers, and assistant behavior from a calmer control panel.",
    team: "Manage shared access, policy, and audit controls without leaving the current route.",
    glasses: "Adjust the wearable command surface and voice-first controls.",
    vr: "Shape the spatial command center and immersive execution surfaces.",
  };
  return descriptions[route];
}

export function PageSlideMenu({
  visible,
  route,
  onClose,
  onGoHome,
  onNavigate,
  poolLifecyclePaused,
  onTogglePoolLifecycle,
  onRefreshAll,
  onReconnectAll,
  onCreateShell,
  onCreateAi,
  tokenMasked,
  onToggleTokenMask,
  includeHidden,
  onToggleIncludeHidden,
  tailLines,
  onSetTailLines,
}: PageSlideMenuProps) {
  const [mounted, setMounted] = useState<boolean>(visible);
  const [activeSectionId, setActiveSectionId] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(-360)).current;

  useEffect(() => {
    if (visible) {
      setMounted(true);
      setActiveSectionId(null);
      Animated.timing(translateX, {
        toValue: 0,
        duration: 220,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(translateX, {
      toValue: -360,
      duration: 180,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setMounted(false);
      }
    });
  }, [translateX, visible]);

  const sections = useMemo<PageMenuSection[]>(() => {
    const sharedNavigationSection: PageMenuSection = {
      id: "navigate",
      title: "Navigate",
      description: "Jump to a primary page from this drawer.",
      render: () => (
        <View style={styles.pageMenuActionGroup}>
          {[
            { key: "terminals" as RouteTab, label: "Terminals" },
            { key: "servers" as RouteTab, label: "Servers" },
            { key: "files" as RouteTab, label: "Files" },
            { key: "llms" as RouteTab, label: "Nova" },
            { key: "team" as RouteTab, label: "Team" },
            { key: "vr" as RouteTab, label: "VR" },
          ].map((entry) => (
            <Pressable
              key={`menu-nav-${entry.key}`}
              accessibilityRole="button"
              accessibilityLabel={`Open ${entry.label}`}
              style={styles.pageMenuActionButton}
              onPress={() => {
                onClose();
                onNavigate(entry.key);
              }}
            >
              <Text style={styles.pageMenuActionText}>{entry.label}</Text>
            </Pressable>
          ))}
        </View>
      ),
    };

    if (route === "terminals") {
      return [
        {
          id: "quick-launch",
          title: "Quick Launch",
          description: "Start sessions without opening extra panels.",
          render: () => (
            <View style={styles.pageMenuActionGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new shell session"
                style={styles.pageMenuActionButton}
                onPress={() => {
                  onClose();
                  onCreateShell();
                }}
              >
                <Text style={styles.pageMenuActionText}>New Shell Session</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Create a new AI session"
                style={styles.pageMenuActionButton}
                onPress={() => {
                  onClose();
                  onCreateAi();
                }}
              >
                <Text style={styles.pageMenuActionText}>New AI Session</Text>
              </Pressable>
            </View>
          ),
        },
        {
          id: "pool",
          title: "Connection Pool",
          description: "Pause, refresh, and reconnect all pooled servers.",
          render: () => (
            <View style={styles.pageMenuActionGroup}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={poolLifecyclePaused ? "Resume connection pool" : "Pause connection pool"}
                style={styles.pageMenuActionButton}
                onPress={() => {
                  onClose();
                  onTogglePoolLifecycle();
                }}
              >
                <Text style={styles.pageMenuActionText}>{poolLifecyclePaused ? "Resume Pool" : "Pause Pool"}</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Refresh all servers"
                style={styles.pageMenuActionButton}
                onPress={() => {
                  onClose();
                  onRefreshAll();
                }}
              >
                <Text style={styles.pageMenuActionText}>Refresh All</Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Reconnect all servers"
                style={styles.pageMenuActionButton}
                onPress={() => {
                  onClose();
                  onReconnectAll();
                }}
              >
                <Text style={styles.pageMenuActionText}>Reconnect All</Text>
              </Pressable>
            </View>
          ),
        },
        sharedNavigationSection,
      ];
    }

    if (route === "servers") {
      return [
        {
          id: "security",
          title: "Security",
          description: "Control token visibility while editing servers.",
          render: () => (
            <View style={styles.pageMenuSwitchRow}>
              <Text style={styles.pageMenuSwitchLabel}>{tokenMasked ? "Token hidden" : "Token visible"}</Text>
              <Switch
                value={tokenMasked}
                onValueChange={() => onToggleTokenMask()}
                trackColor={{ false: "#4d5272", true: "#1586b3" }}
                thumbColor={tokenMasked ? "#ccf6ff" : "#d7def2"}
              />
            </View>
          ),
        },
        sharedNavigationSection,
      ];
    }

    if (route === "files") {
      return [
        {
          id: "file-view",
          title: "File View",
          description: "Tune visibility and live tail length.",
          render: () => (
            <View style={styles.pageMenuActionGroup}>
              <View style={styles.pageMenuSwitchRow}>
                <Text style={styles.pageMenuSwitchLabel}>{includeHidden ? "Showing hidden files" : "Hidden files off"}</Text>
                <Switch
                  value={includeHidden}
                  onValueChange={onToggleIncludeHidden}
                  trackColor={{ false: "#4d5272", true: "#1586b3" }}
                  thumbColor={includeHidden ? "#ccf6ff" : "#d7def2"}
                />
              </View>
              <View style={styles.pageMenuStepperRow}>
                  <Text style={styles.pageMenuSwitchLabel}>{`Tail lines: ${tailLines || "200"}`}</Text>
                  <View style={styles.pageMenuStepperButtons}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Decrease tail lines"
                      style={styles.pageMenuStepperButton}
                      onPress={() => {
                        const parsed = Math.max(10, Number.parseInt(tailLines, 10) || 200);
                        onSetTailLines(String(Math.max(10, parsed - 50)));
                      }}
                    >
                      <Text style={styles.pageMenuStepperText}>-</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel="Increase tail lines"
                      style={styles.pageMenuStepperButton}
                      onPress={() => {
                        const parsed = Math.max(10, Number.parseInt(tailLines, 10) || 200);
                        onSetTailLines(String(Math.min(1000, parsed + 50)));
                      }}
                    >
                      <Text style={styles.pageMenuStepperText}>+</Text>
                    </Pressable>
                  </View>
              </View>
            </View>
          ),
        },
        sharedNavigationSection,
      ];
    }

    return [sharedNavigationSection];
  }, [
    includeHidden,
    onClose,
    onCreateAi,
    onCreateShell,
    onNavigate,
    onReconnectAll,
    onRefreshAll,
    onSetTailLines,
    onToggleIncludeHidden,
    onTogglePoolLifecycle,
    onToggleTokenMask,
    poolLifecyclePaused,
    route,
    tailLines,
    tokenMasked,
  ]);

  const activeSection = activeSectionId ? sections.find((entry) => entry.id === activeSectionId) || null : null;

  if (!mounted) {
    return null;
  }

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.pageMenuRoot}>
        <Pressable style={styles.pageMenuBackdrop} onPress={onClose} />
        <Animated.View style={[styles.pageMenuPanel, { transform: [{ translateX }] }]}>
          <ScrollView
            style={styles.pageMenuScroll}
            contentContainerStyle={styles.pageMenuScrollContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.pageMenuHeroCard}>
              <Text style={styles.pageMenuEyebrow}>Control surface</Text>
              <Text style={styles.pageMenuTitle}>{routeTitle(route)}</Text>
              <Text style={styles.pageMenuLead}>
                {activeSection ? activeSection.description : routeDescription(route)}
              </Text>
            </View>

            {activeSection ? (
              <View style={styles.pageMenuSectionWrap}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Back to menu sections"
                  style={styles.pageMenuBackButton}
                  onPress={() => setActiveSectionId(null)}
                >
                  <Text style={styles.pageMenuBackText}>Back</Text>
                </Pressable>
                <Text style={styles.pageMenuSectionTitle}>{activeSection.title}</Text>
                <Text style={styles.pageMenuSectionDescription}>{activeSection.description}</Text>
                <View style={styles.pageMenuSectionBody}>{activeSection.render()}</View>
              </View>
            ) : (
              <View style={styles.pageMenuSectionList}>
                {sections.map((section) => (
                  <Pressable
                    key={section.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${section.title}`}
                    style={styles.pageMenuSectionCard}
                    onPress={() => setActiveSectionId(section.id)}
                  >
                    <Text style={styles.pageMenuSectionCardTitle}>{section.title}</Text>
                    <Text style={styles.pageMenuSectionCardDescription}>{section.description}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </ScrollView>
          <View style={styles.pageMenuFooterActions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Return to home hub"
              style={[styles.pageMenuHomeButton, styles.pageMenuHomeButtonFooter]}
              onPress={() => {
                onClose();
                onGoHome();
              }}
            >
              <Text style={styles.pageMenuHomeText}>Home</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

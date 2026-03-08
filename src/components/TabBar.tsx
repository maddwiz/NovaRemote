import React, { useMemo, useState } from "react";
import { Modal, PanResponder, Pressable, Text, View, useWindowDimensions } from "react-native";

import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type TabBarProps = {
  route: RouteTab;
  onChange: (next: RouteTab) => void;
  simpleMode?: boolean;
  onToggleSimpleMode?: () => void;
  compactBottomNav?: boolean;
};

export function TabBar({
  route,
  onChange,
  simpleMode = false,
  onToggleSimpleMode,
  compactBottomNav = false,
}: TabBarProps) {
  const { width } = useWindowDimensions();
  const compact = width < 680;
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const allTabs: Array<{ key: RouteTab; label: string; accessibilityLabel: string }> = [
    { key: "terminals", label: "Terminals", accessibilityLabel: "Open terminals tab" },
    { key: "servers", label: "Servers", accessibilityLabel: "Open servers tab" },
    { key: "snippets", label: "Snippets", accessibilityLabel: "Open snippets tab" },
    { key: "files", label: "Files", accessibilityLabel: "Open files tab" },
    { key: "llms", label: "LLMs", accessibilityLabel: "Open LLM profiles tab" },
    { key: "team", label: "Team", accessibilityLabel: "Open team tab" },
    { key: "vr", label: "VR", accessibilityLabel: "Open VR command center tab" },
  ];
  const tabs = useMemo(
    () => {
      if (compactBottomNav) {
        if (simpleMode) {
          return allTabs.filter((tab) =>
            tab.key === "terminals" || tab.key === "servers" || tab.key === "files" || tab.key === "snippets"
          );
        }
        return allTabs;
      }
      return simpleMode ? allTabs.filter((tab) => tab.key === "terminals" || tab.key === "servers") : allTabs;
    },
    [allTabs, compactBottomNav, simpleMode]
  );
  const activeTabLabel = useMemo(
    () => allTabs.find((tab) => tab.key === route)?.label || "Navigation",
    [route, allTabs]
  );
  const tabOrder = useMemo(() => tabs.map((tab) => tab.key), [tabs]);
  const swipeResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_event, gesture) =>
          Math.abs(gesture.dx) > 20 && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.2,
        onPanResponderRelease: (_event, gesture) => {
          if (Math.abs(gesture.dx) < 56) {
            return;
          }
          const currentIndex = tabOrder.indexOf(route);
          if (currentIndex < 0) {
            return;
          }
          if (gesture.dx < 0) {
            const next = tabOrder[currentIndex + 1];
            if (next) {
              onChange(next);
            }
            return;
          }
          const previous = tabOrder[currentIndex - 1];
          if (previous) {
            onChange(previous);
          }
        },
      }),
    [onChange, route, tabOrder]
  );

  const tabButtons = tabs.map((tab) => (
    <Pressable
      key={tab.key}
      style={[
        styles.tabButton,
        styles.flexButton,
        route === tab.key ? styles.tabButtonOn : null,
      ]}
      onPress={() => onChange(tab.key)}
      accessibilityRole="button"
      accessibilityLabel={tab.accessibilityLabel}
    >
      <Text numberOfLines={1} style={[styles.tabButtonText, route === tab.key ? styles.tabButtonTextOn : null]}>
        {tab.label}
      </Text>
    </Pressable>
  ));

  if (compact && compactBottomNav) {
    const quickOrder: RouteTab[] = ["terminals", "servers", "files", "snippets"];
    const quickTabs = quickOrder
      .map((key) => tabs.find((tab) => tab.key === key))
      .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));
    const quickTabSet = new Set(quickTabs.map((tab) => tab.key));
    const moreTabs = tabs.filter((tab) => !quickTabSet.has(tab.key));
    const routeInMore = moreTabs.some((tab) => tab.key === route);

    return (
      <>
        <View style={styles.bottomQuickNav} {...swipeResponder.panHandlers}>
          {quickTabs.map((tab) => (
            <Pressable
              key={`quick-${tab.key}`}
              accessibilityRole="button"
              accessibilityLabel={tab.accessibilityLabel}
              style={[styles.bottomQuickNavButton, route === tab.key ? styles.bottomQuickNavButtonActive : null]}
              onPress={() => onChange(tab.key)}
            >
              <Text
                numberOfLines={1}
                style={[
                  styles.bottomQuickNavButtonText,
                  route === tab.key ? styles.bottomQuickNavButtonTextActive : null,
                ]}
              >
                {tab.label}
              </Text>
            </Pressable>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open more navigation actions"
            style={[styles.bottomQuickNavButton, routeInMore ? styles.bottomQuickNavButtonActive : null]}
            onPress={() => setDrawerOpen(true)}
          >
            <Text
              numberOfLines={1}
              style={[
                styles.bottomQuickNavButtonText,
                routeInMore ? styles.bottomQuickNavButtonTextActive : null,
              ]}
            >
              More
            </Text>
          </Pressable>
        </View>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <Pressable style={styles.overlayBackdrop} onPress={() => setDrawerOpen(false)}>
            <Pressable
              style={styles.overlayCard}
              onPress={(event) => {
                event.stopPropagation();
              }}
            >
              <Text style={styles.navDrawerTitle}>More</Text>
              <View style={styles.navDrawerList}>
                {moreTabs.length === 0 ? (
                  <Text style={styles.serverSubtitle}>No extra pages in current mode.</Text>
                ) : (
                  moreTabs.map((tab) => (
                    <Pressable
                      key={`more-${tab.key}`}
                      accessibilityRole="button"
                      accessibilityLabel={tab.accessibilityLabel}
                      style={[styles.navDrawerItem, route === tab.key ? styles.navDrawerItemActive : null]}
                      onPress={() => {
                        setDrawerOpen(false);
                        onChange(tab.key);
                      }}
                    >
                      <Text style={[styles.navDrawerItemText, route === tab.key ? styles.navDrawerItemTextActive : null]}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  ))
                )}
              </View>
              {onToggleSimpleMode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={simpleMode ? "Switch to full interface" : "Switch to simple interface"}
                  style={styles.navModeButton}
                  onPress={() => {
                    setDrawerOpen(false);
                    onToggleSimpleMode();
                  }}
                >
                  <Text style={styles.navModeButtonText}>
                    {simpleMode ? "Switch to Full Interface" : "Switch to Simple Interface"}
                  </Text>
                </Pressable>
              ) : null}
            </Pressable>
          </Pressable>
        </Modal>
      </>
    );
  }

  if (compact) {
    return (
      <>
        <View style={styles.navCompactRow} {...swipeResponder.panHandlers}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open navigation menu"
            style={styles.navMenuButton}
            onPress={() => setDrawerOpen(true)}
          >
            <Text style={styles.navMenuButtonText}>Menu</Text>
          </Pressable>
          <Text style={styles.navCompactTitle} numberOfLines={1}>
            {activeTabLabel}
          </Text>
          {onToggleSimpleMode ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={simpleMode ? "Switch to full interface" : "Switch to simple interface"}
              style={styles.navModeButton}
              onPress={onToggleSimpleMode}
            >
              <Text style={styles.navModeButtonText}>{simpleMode ? "Full" : "Simple"}</Text>
            </Pressable>
          ) : null}
        </View>

        <Modal visible={drawerOpen} transparent animationType="fade" onRequestClose={() => setDrawerOpen(false)}>
          <View style={styles.navDrawerRoot}>
            <View style={styles.navDrawerPanel}>
              <Text style={styles.navDrawerTitle}>Navigate</Text>
              <View style={styles.navDrawerList}>
                {tabs.map((tab) => (
                  <Pressable
                    key={`drawer-${tab.key}`}
                    accessibilityRole="button"
                    accessibilityLabel={tab.accessibilityLabel}
                    style={[styles.navDrawerItem, route === tab.key ? styles.navDrawerItemActive : null]}
                    onPress={() => {
                      setDrawerOpen(false);
                      onChange(tab.key);
                    }}
                  >
                    <Text style={[styles.navDrawerItemText, route === tab.key ? styles.navDrawerItemTextActive : null]}>
                      {tab.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              {onToggleSimpleMode ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={simpleMode ? "Switch to full interface" : "Switch to simple interface"}
                  style={styles.navModeButton}
                  onPress={() => {
                    setDrawerOpen(false);
                    onToggleSimpleMode();
                  }}
                >
                  <Text style={styles.navModeButtonText}>
                    {simpleMode ? "Switch to Full Interface" : "Switch to Simple Interface"}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Close navigation menu"
              style={styles.navDrawerBackdrop}
              onPress={() => setDrawerOpen(false)}
            />
          </View>
        </Modal>
      </>
    );
  }

  return (
    <View style={styles.tabRow} {...swipeResponder.panHandlers}>
      {tabButtons}
      {onToggleSimpleMode ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={simpleMode ? "Switch to full interface" : "Switch to simple interface"}
          style={styles.tabButton}
          onPress={onToggleSimpleMode}
        >
          <Text numberOfLines={1} style={styles.tabButtonText}>
            {simpleMode ? "Full UI" : "Simple UI"}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

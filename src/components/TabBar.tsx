import React, { useMemo, useState } from "react";
import { Modal, Pressable, Text, View, useWindowDimensions } from "react-native";

import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type TabBarProps = {
  route: RouteTab;
  onChange: (next: RouteTab) => void;
  simpleMode?: boolean;
  onToggleSimpleMode?: () => void;
};

export function TabBar({ route, onChange, simpleMode = false, onToggleSimpleMode }: TabBarProps) {
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
    () => (simpleMode ? allTabs.filter((tab) => tab.key === "terminals" || tab.key === "servers") : allTabs),
    [allTabs, simpleMode]
  );
  const activeTabLabel = useMemo(
    () => allTabs.find((tab) => tab.key === route)?.label || "Navigation",
    [route, allTabs]
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

  if (compact) {
    return (
      <>
        <View style={styles.navCompactRow}>
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
    <View style={styles.tabRow}>
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

import React from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";

import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type TabBarProps = {
  route: RouteTab;
  onChange: (next: RouteTab) => void;
};

export function TabBar({ route, onChange }: TabBarProps) {
  const { width } = useWindowDimensions();
  const compact = width < 520;
  const tabs: Array<{ key: RouteTab; label: string; accessibilityLabel: string }> = [
    { key: "terminals", label: "Terminals", accessibilityLabel: "Open terminals tab" },
    { key: "servers", label: "Servers", accessibilityLabel: "Open servers tab" },
    { key: "snippets", label: "Snippets", accessibilityLabel: "Open snippets tab" },
    { key: "files", label: "Files", accessibilityLabel: "Open files tab" },
    { key: "llms", label: "LLMs", accessibilityLabel: "Open LLM profiles tab" },
    { key: "team", label: "Team", accessibilityLabel: "Open team tab" },
    { key: "vr", label: "VR", accessibilityLabel: "Open VR command center tab" },
  ];

  const tabButtons = tabs.map((tab) => (
    <Pressable
      key={tab.key}
      style={[
        styles.tabButton,
        compact ? styles.tabButtonCompact : styles.flexButton,
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
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabRowCompactContent}>
        {tabButtons}
      </ScrollView>
    );
  }

  return (
    <View style={styles.tabRow}>
      {tabButtons}
    </View>
  );
}

import React from "react";
import { Pressable, Text, View } from "react-native";

import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type TabBarProps = {
  route: RouteTab;
  onChange: (next: RouteTab) => void;
};

export function TabBar({ route, onChange }: TabBarProps) {
  return (
    <View style={styles.tabRow}>
      <Pressable
        style={[styles.tabButton, route === "terminals" ? styles.tabButtonOn : null]}
        onPress={() => onChange("terminals")}
        accessibilityRole="button"
        accessibilityLabel="Open terminals tab"
      >
        <Text style={[styles.tabButtonText, route === "terminals" ? styles.tabButtonTextOn : null]}>Terminals</Text>
      </Pressable>
      <Pressable
        style={[styles.tabButton, route === "servers" ? styles.tabButtonOn : null]}
        onPress={() => onChange("servers")}
        accessibilityRole="button"
        accessibilityLabel="Open servers tab"
      >
        <Text style={[styles.tabButtonText, route === "servers" ? styles.tabButtonTextOn : null]}>Servers</Text>
      </Pressable>
      <Pressable
        style={[styles.tabButton, route === "snippets" ? styles.tabButtonOn : null]}
        onPress={() => onChange("snippets")}
        accessibilityRole="button"
        accessibilityLabel="Open snippets tab"
      >
        <Text style={[styles.tabButtonText, route === "snippets" ? styles.tabButtonTextOn : null]}>Snippets</Text>
      </Pressable>
      <Pressable
        style={[styles.tabButton, route === "files" ? styles.tabButtonOn : null]}
        onPress={() => onChange("files")}
        accessibilityRole="button"
        accessibilityLabel="Open files tab"
      >
        <Text style={[styles.tabButtonText, route === "files" ? styles.tabButtonTextOn : null]}>Files</Text>
      </Pressable>
      <Pressable
        style={[styles.tabButton, route === "llms" ? styles.tabButtonOn : null]}
        onPress={() => onChange("llms")}
        accessibilityRole="button"
        accessibilityLabel="Open LLM profiles tab"
      >
        <Text style={[styles.tabButtonText, route === "llms" ? styles.tabButtonTextOn : null]}>LLMs</Text>
      </Pressable>
    </View>
  );
}

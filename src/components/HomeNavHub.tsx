import React from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";

import { BRAND_LOGO } from "../branding";
import { styles } from "../theme/styles";
import { RouteTab } from "../types";

type HomeNavHubProps = {
  onOpenRoute: (route: RouteTab) => void;
  activeServerName: string;
  statusText: string;
};

type HomeNavItem = {
  key: RouteTab;
  title: string;
  subtitle: string;
  tone: "cyan" | "violet" | "pink" | "slate";
};

const ROUTES: HomeNavItem[] = [
  { key: "terminals", title: "Terminals", subtitle: "Sessions and live output", tone: "pink" },
  { key: "servers", title: "Servers", subtitle: "Targets and security", tone: "slate" },
  { key: "files", title: "Files", subtitle: "Remote browser and editor", tone: "cyan" },
  { key: "llms", title: "Nova", subtitle: "Voice, models, and control", tone: "violet" },
  { key: "snippets", title: "Snippets", subtitle: "Reusable actions", tone: "violet" },
  { key: "team", title: "Team", subtitle: "Policies and audit", tone: "slate" },
  { key: "vr", title: "Spatial", subtitle: "Glasses and VR center", tone: "pink" },
];

function toneStyle(tone: HomeNavItem["tone"]) {
  switch (tone) {
    case "cyan":
      return styles.homeHubToneCyan;
    case "violet":
      return styles.homeHubToneViolet;
    case "pink":
      return styles.homeHubTonePink;
    default:
      return styles.homeHubToneSlate;
  }
}

export function HomeNavHub({ onOpenRoute, activeServerName, statusText }: HomeNavHubProps) {
  const { width } = useWindowDimensions();
  const compact = width < 760;

  return (
    <View style={styles.homeHubRoot}>
      <View style={styles.homeHubHeaderSimple}>
        <Text style={styles.homeHubEyebrow}>Command Surface</Text>
        <Text style={styles.homeHubStatus}>{statusText}</Text>
      </View>

      <View style={[styles.homeHubHeroCard, compact ? styles.homeHubHeroCardCompact : null]}>
        <View style={styles.homeHubHeroGlowA} />
        <View style={styles.homeHubHeroGlowB} />
        <View style={styles.homeHubBrandBlock}>
          <View style={styles.homeHubPlasmaWrap}>
            <Image source={BRAND_LOGO} style={styles.homeHubLogo} resizeMode="contain" />
          </View>
          <Text style={styles.homeHubWordmark}>NovaRemote</Text>
          <Text style={styles.homeHubSummary}>
            Remote AI, terminals, files, and multi-server control in one mobile command surface.
          </Text>
          <Text style={styles.homeHubFocusedServer}>Focused server: {activeServerName}</Text>
        </View>
      </View>

      <View style={styles.homeHubSectionHeader}>
        <Text style={styles.homeHubSectionTitle}>Launch Deck</Text>
        <Text style={styles.homeHubSectionMeta}>Core surfaces</Text>
      </View>

      <View style={[styles.homeHubCardGrid, compact ? styles.homeHubCardGridCompact : null]}>
        {ROUTES.map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            style={[
              styles.homeHubLaunchCard,
              compact ? styles.homeHubLaunchCardCompact : null,
              toneStyle(item.tone),
            ]}
            onPress={() => onOpenRoute(item.key)}
          >
            <View style={styles.homeHubLaunchAccent} />
            <Text style={styles.homeHubLaunchTitle}>{item.title}</Text>
            <Text style={styles.homeHubLaunchSubtitle}>{item.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

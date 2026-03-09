import React from "react";
import { Image, Pressable, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";

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

const ICON_STROKE = "#ff93e6";

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

function HomeHubRouteIcon({ route }: { route: RouteTab }) {
  const commonProps = {
    stroke: ICON_STROKE,
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    fill: "none" as const,
  };

  switch (route) {
    case "terminals":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect x={4.5} y={5.5} width={15} height={13} rx={3.2} {...commonProps} />
          <Path d="M8 10l2.6 2.4L8 14.8" {...commonProps} />
          <Line x1={12.8} y1={14.8} x2={16.2} y2={14.8} {...commonProps} />
        </Svg>
      );
    case "servers":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect x={5} y={5.5} width={14} height={5.2} rx={2.2} {...commonProps} />
          <Rect x={5} y={13.3} width={14} height={5.2} rx={2.2} {...commonProps} />
          <Circle cx={8} cy={8.1} r={0.9} fill={ICON_STROKE} />
          <Circle cx={8} cy={15.9} r={0.9} fill={ICON_STROKE} />
          <Line x1={11} y1={8.1} x2={16.2} y2={8.1} {...commonProps} />
          <Line x1={11} y1={15.9} x2={16.2} y2={15.9} {...commonProps} />
        </Svg>
      );
    case "files":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d="M8 4.8h5.6l4.4 4.4v9.5a2.4 2.4 0 0 1-2.4 2.4H8a2.4 2.4 0 0 1-2.4-2.4V7.2A2.4 2.4 0 0 1 8 4.8Z" {...commonProps} />
          <Path d="M13.4 4.8v4.1h4.1" {...commonProps} />
          <Line x1={8.4} y1={13} x2={15.6} y2={13} {...commonProps} />
          <Line x1={8.4} y1={16.4} x2={13.8} y2={16.4} {...commonProps} />
        </Svg>
      );
    case "llms":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Circle cx={12} cy={12} r={2.4} {...commonProps} />
          <Path d="M12 4.8 13.4 8l3.3.6-2.4 2.3.6 3.4L12 12.8l-2.9 1.5.6-3.4-2.4-2.3 3.3-.6L12 4.8Z" {...commonProps} />
        </Svg>
      );
    case "snippets":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Path d="M9.5 7.2 6.6 12l2.9 4.8" {...commonProps} />
          <Path d="M14.5 7.2 17.4 12l-2.9 4.8" {...commonProps} />
          <Line x1={11.2} y1={18} x2={12.9} y2={6} {...commonProps} />
        </Svg>
      );
    case "team":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Circle cx={9} cy={10} r={2.4} {...commonProps} />
          <Circle cx={15.5} cy={9.2} r={2} {...commonProps} />
          <Path d="M5.5 17.6c.7-2 2.4-3 5-3s4.3 1 5 3" {...commonProps} />
          <Path d="M13.8 17.2c.4-1.5 1.6-2.2 3.5-2.2 1 0 1.8.2 2.4.5" {...commonProps} />
        </Svg>
      );
    case "vr":
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Rect x={4.6} y={8.1} width={14.8} height={7.8} rx={3.2} {...commonProps} />
          <Path d="M9 8.3v7.4" {...commonProps} />
          <Path d="M15 8.3v7.4" {...commonProps} />
          <Path d="M6.5 16.2 5 18.8" {...commonProps} />
          <Path d="M17.5 16.2 19 18.8" {...commonProps} />
        </Svg>
      );
    default:
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24">
          <Ellipse cx={12} cy={12} rx={7} ry={4.2} {...commonProps} />
          <Circle cx={12} cy={12} r={1.5} fill={ICON_STROKE} />
        </Svg>
      );
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
            <View style={styles.homeHubLaunchAccent}>
              <View style={styles.homeHubLaunchAccentGlow} />
              <HomeHubRouteIcon route={item.key} />
            </View>
            <Text style={styles.homeHubLaunchTitle}>{item.title}</Text>
            <Text style={styles.homeHubLaunchSubtitle}>{item.subtitle}</Text>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

import React, { useMemo } from "react";
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

const PRIMARY_ROUTES: HomeNavItem[] = [
  { key: "files", title: "Files", subtitle: "Open, tail, and edit remote code", tone: "cyan" },
  { key: "snippets", title: "Snippets", subtitle: "Reusable actions and runbooks", tone: "violet" },
  { key: "team", title: "Team", subtitle: "Policies, audit, and shared access", tone: "slate" },
  { key: "vr", title: "Spatial", subtitle: "Glasses and VR command center", tone: "pink" },
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

  const activityCards = useMemo<HomeNavItem[]>(
    () => [
      { key: "llms", title: "Nova", subtitle: "Voice, models, and automation", tone: "pink" },
      { key: "servers", title: "Servers", subtitle: "Switch targets and security", tone: "slate" },
    ],
    []
  );

  return (
    <View style={styles.homeHubRoot}>
      <View style={[styles.homeHubHeaderRow, compact ? styles.homeHubHeaderRowCompact : null]}>
        <View style={styles.flex}>
          <Text style={styles.homeHubEyebrow}>Command Surface</Text>
          <Text style={styles.homeHubStatus}>{statusText}</Text>
          <Text style={styles.homeHubLead}>
            {activeServerName} is your live lane. Launch into terminals, files, and Nova from a cleaner dashboard.
          </Text>
        </View>
        <View style={styles.homeHubHeaderBadge}>
          <Text style={styles.homeHubHeaderBadgeLabel}>Active target</Text>
          <Text style={styles.homeHubHeaderBadgeValue}>{activeServerName}</Text>
        </View>
      </View>

      <View style={[styles.homeHubShowcaseRow, compact ? styles.homeHubShowcaseColumn : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open terminals"
          style={[styles.homeHubHeroCard, compact ? styles.homeHubHeroCardCompact : null]}
          onPress={() => onOpenRoute("terminals")}
        >
          <View style={styles.homeHubHeroGlowA} />
          <View style={styles.homeHubHeroGlowB} />
          <View style={[styles.homeHubHeroContent, compact ? styles.homeHubHeroContentCompact : null]}>
            <View style={styles.homeHubHeroCopy}>
              <Text style={styles.homeHubHeroEyebrow}>Live workspace</Text>
              <Text style={styles.homeHubHeroTitle}>Enter the terminal deck without the clutter.</Text>
              <Text style={styles.homeHubHeroSubtitle}>
                Sessions, pooled servers, and Nova stay one tap away instead of buried under controls.
              </Text>
              <View style={styles.homeHubHeroActions}>
                <View style={styles.homeHubHeroPrimaryButton}>
                  <Text style={styles.homeHubHeroPrimaryText}>Open Terminals</Text>
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Nova"
                  style={styles.homeHubHeroSecondaryButton}
                  onPress={(event) => {
                    event.stopPropagation();
                    onOpenRoute("llms");
                  }}
                >
                  <Text style={styles.homeHubHeroSecondaryText}>Open Nova</Text>
                </Pressable>
              </View>
              <View style={styles.homeHubHeroStatRow}>
                <View style={styles.homeHubHeroStatPill}>
                  <Text style={styles.homeHubHeroStatLabel}>Route</Text>
                  <Text style={styles.homeHubHeroStatValue}>Terminals</Text>
                </View>
                <View style={styles.homeHubHeroStatPill}>
                  <Text style={styles.homeHubHeroStatLabel}>Surface</Text>
                  <Text style={styles.homeHubHeroStatValue}>Minimal deck</Text>
                </View>
              </View>
            </View>

            <View
              style={[
                styles.homeHubHeroVisual,
                compact ? styles.homeHubHeroVisualCompact : null,
              ]}
            >
              <View style={styles.homeHubPlasmaWrap}>
                <Image source={BRAND_LOGO} style={styles.homeHubLogo} resizeMode="contain" />
              </View>
              <Text style={styles.homeHubWordmark}>NovaRemote</Text>
            </View>
          </View>
        </Pressable>

        <View style={[styles.homeHubAsideColumn, compact ? styles.homeHubAsideColumnCompact : null]}>
          {activityCards.map((item) => (
            <Pressable
              key={item.key}
              accessibilityRole="button"
              accessibilityLabel={`Open ${item.title}`}
              style={[styles.homeHubAsideCard, toneStyle(item.tone)]}
              onPress={() => onOpenRoute(item.key)}
            >
              <Text style={styles.homeHubAsideTitle}>{item.title}</Text>
              <Text style={styles.homeHubAsideCopy}>{item.subtitle}</Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.homeHubSectionHeader}>
        <Text style={styles.homeHubSectionTitle}>Launch Deck</Text>
        <Text style={styles.homeHubSectionMeta}>Core surfaces</Text>
      </View>

      <View style={[styles.homeHubCardGrid, compact ? styles.homeHubCardGridCompact : null]}>
        {PRIMARY_ROUTES.map((item) => (
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

      <View style={[styles.homeHubFeedRow, compact ? styles.homeHubFeedRowCompact : null]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open servers"
          style={styles.homeHubFeedCard}
          onPress={() => onOpenRoute("servers")}
        >
          <Text style={styles.homeHubFeedLabel}>Connection rail</Text>
          <Text style={styles.homeHubFeedTitle}>Server switching stays instant and visually quieter.</Text>
          <Text style={styles.homeHubFeedCopy}>Jump between machines without losing terminal state or reopening panels.</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open Nova providers"
          style={styles.homeHubFeedCard}
          onPress={() => onOpenRoute("llms")}
        >
          <Text style={styles.homeHubFeedLabel}>Nova layer</Text>
          <Text style={styles.homeHubFeedTitle}>Text, voice, and remote execution are moving into one surface.</Text>
          <Text style={styles.homeHubFeedCopy}>Use the assistant as the control layer instead of learning every control upfront.</Text>
        </Pressable>
      </View>
    </View>
  );
}

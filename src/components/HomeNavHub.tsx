import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Image, Pressable, Text, View } from "react-native";

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
};

export function HomeNavHub({ onOpenRoute, activeServerName, statusText }: HomeNavHubProps) {
  const orbit = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const orbitLoop = Animated.loop(
      Animated.timing(orbit, {
        toValue: 1,
        duration: 18_000,
        useNativeDriver: true,
      })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 2_200,
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 2_200,
          useNativeDriver: true,
        }),
      ])
    );

    orbitLoop.start();
    pulseLoop.start();

    return () => {
      orbitLoop.stop();
      pulseLoop.stop();
    };
  }, [orbit, pulse]);

  const ringRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const logoRotate = orbit.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "-360deg"],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1.06],
  });

  const navItems = useMemo<HomeNavItem[]>(
    () => [
      { key: "terminals", title: "Terminals", subtitle: "Live sessions" },
      { key: "servers", title: "Servers", subtitle: "Connections" },
      { key: "files", title: "Files", subtitle: "Browser + editor" },
      { key: "llms", title: "AI", subtitle: "Model profiles" },
      { key: "team", title: "Team", subtitle: "Policies + audit" },
      { key: "vr", title: "VR", subtitle: "Command center" },
      { key: "snippets", title: "Snippets", subtitle: "Macros + runbooks" },
    ],
    []
  );

  return (
    <View style={styles.homeHubRoot}>
      <Text style={styles.homeHubEyebrow}>{activeServerName}</Text>
      <Text style={styles.homeHubStatus}>{statusText}</Text>

      <View style={styles.homeHubTopRow}>
        {navItems.slice(0, 2).map((item) => (
          <Pressable
            key={item.key}
            accessibilityRole="button"
            accessibilityLabel={`Open ${item.title}`}
            style={styles.homeHubNavCard}
            onPress={() => onOpenRoute(item.key)}
          >
            <Text style={styles.homeHubNavTitle}>{item.title}</Text>
            <Text style={styles.homeHubNavSubtitle}>{item.subtitle}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.homeHubMiddleRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open files"
          style={styles.homeHubNavCardTall}
          onPress={() => onOpenRoute("files")}
        >
          <Text style={styles.homeHubNavTitle}>Files</Text>
          <Text style={styles.homeHubNavSubtitle}>Remote browser</Text>
        </Pressable>

        <View style={styles.homeHubLogoShell}>
          <Animated.View style={[styles.homeHubHalo, { transform: [{ scale: haloScale }] }]} />
          <Animated.View style={[styles.homeHubRing, { transform: [{ rotate: ringRotate }] }]} />
          <Animated.View style={[styles.homeHubPlasmaWrap, { transform: [{ rotate: logoRotate }] }]}>
            <Image source={BRAND_LOGO} style={styles.homeHubLogo} resizeMode="cover" />
          </Animated.View>
          <Text style={styles.homeHubWordmark}>NovaRemote</Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open AI profiles"
          style={styles.homeHubNavCardTall}
          onPress={() => onOpenRoute("llms")}
        >
          <Text style={styles.homeHubNavTitle}>AI</Text>
          <Text style={styles.homeHubNavSubtitle}>Prompt engines</Text>
        </Pressable>
      </View>

      <View style={styles.homeHubBottomRow}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open team workspace"
          style={styles.homeHubNavCard}
          onPress={() => onOpenRoute("team")}
        >
          <Text style={styles.homeHubNavTitle}>Team</Text>
          <Text style={styles.homeHubNavSubtitle}>Roles + compliance</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open VR command center"
          style={styles.homeHubNavCard}
          onPress={() => onOpenRoute("vr")}
        >
          <Text style={styles.homeHubNavTitle}>VR</Text>
          <Text style={styles.homeHubNavSubtitle}>Spatial control</Text>
        </Pressable>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open snippets"
        style={styles.homeHubNavStrip}
        onPress={() => onOpenRoute("snippets")}
      >
        <Text style={styles.homeHubNavTitle}>Snippets</Text>
        <Text style={styles.homeHubNavSubtitle}>Reusable command actions</Text>
      </Pressable>
    </View>
  );
}


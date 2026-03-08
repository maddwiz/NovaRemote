import React, { useEffect, useRef } from "react";
import { Animated, Image, Text, View } from "react-native";

import { BRAND_LOGO } from "../branding";
import { styles } from "../theme/styles";

type LaunchIntroProps = {
  visible: boolean;
  onDone: () => void;
};

export function LaunchIntro({ visible, onDone }: LaunchIntroProps) {
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.94)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    opacity.setValue(0);
    scale.setValue(0.94);

    const intro = Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.02,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(360),
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 650,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 1.08,
          duration: 650,
          useNativeDriver: true,
        }),
      ]),
    ]);

    intro.start(({ finished }) => {
      if (finished) {
        onDone();
      }
    });

    return () => {
      intro.stop();
    };
  }, [opacity, onDone, scale, visible]);

  if (!visible) {
    return null;
  }

  return (
    <View style={styles.launchIntroBackdrop} pointerEvents="auto">
      <Animated.View
        style={[
          styles.launchIntroOrb,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      >
        <Image source={BRAND_LOGO} style={styles.launchIntroLogo} resizeMode="cover" />
      </Animated.View>
      <Animated.Text style={[styles.launchIntroWordmark, { opacity }]}>NovaRemote</Animated.Text>
      <Text style={styles.launchIntroTagline}>Universal AI + Terminal Remote Control</Text>
    </View>
  );
}


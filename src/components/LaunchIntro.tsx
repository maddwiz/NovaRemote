import React, { useEffect, useRef } from "react";
import { Animated, Easing, Image, View } from "react-native";

import { BRAND_LOGO } from "../branding";
import { styles } from "../theme/styles";

type LaunchIntroProps = {
  visible: boolean;
  onDone: () => void;
};

export function LaunchIntro({ visible, onDone }: LaunchIntroProps) {
  const opacity = useRef(new Animated.Value(1)).current;
  const scale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (!visible) {
      return;
    }

    opacity.setValue(1);
    scale.setValue(1);

    const pulse = () =>
      Animated.sequence([
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1.08,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 0.88,
            duration: 300,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 260,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 260,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ]);

    const intro = Animated.sequence([pulse(), Animated.delay(120), pulse(), Animated.delay(120), pulse()]);

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
        <Image source={BRAND_LOGO} style={styles.launchIntroLogo} resizeMode="contain" />
      </Animated.View>
    </View>
  );
}

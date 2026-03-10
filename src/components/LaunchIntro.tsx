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
        Animated.timing(scale, {
          toValue: 1.055,
          duration: 720,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.92,
          duration: 720,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.parallel([
          Animated.timing(scale, {
            toValue: 1,
            duration: 760,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
          Animated.timing(opacity, {
            toValue: 1,
            duration: 760,
            easing: Easing.inOut(Easing.sin),
            useNativeDriver: true,
          }),
        ]),
      ]);

    const intro = Animated.sequence([pulse(), Animated.delay(260), pulse(), Animated.delay(260), pulse()]);

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
      <Animated.Image
        source={BRAND_LOGO}
        resizeMode="contain"
        style={[
          styles.launchIntroLogo,
          {
            opacity,
            transform: [{ scale }],
          },
        ]}
      />
    </View>
  );
}

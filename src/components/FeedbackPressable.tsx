import { createAudioPlayer, type AudioPlayer } from "expo-audio";
import * as Haptics from "expo-haptics";
import React, { forwardRef } from "react";
import {
  Platform,
  Pressable as ReactNativePressable,
  type PressableProps,
  type PressableStateCallbackType,
  StyleSheet,
  type StyleProp,
  type ViewStyle,
  Vibration,
} from "react-native";

type FeedbackPressableProps = PressableProps & {
  feedbackHaptics?: boolean;
  feedbackStrong?: boolean;
  feedbackGlowColor?: string;
  feedbackDisabledVisuals?: boolean;
};

const DEFAULT_GLOW_COLOR = "#ff2ea6";

let buttonPressPlayer: AudioPlayer | null = null;
let lastButtonFeedbackAt = 0;

function resolveButtonPressSoundSource(): number | { uri: string } {
  if (typeof process !== "undefined" && process.env.VITEST) {
    return { uri: "button-tap.wav" };
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require("../../assets/ui/button-tap.wav");
}

function getButtonPressPlayer(): AudioPlayer {
  if (!buttonPressPlayer) {
    buttonPressPlayer = createAudioPlayer(resolveButtonPressSoundSource(), {
      keepAudioSessionActive: false,
    });
    buttonPressPlayer.volume = 0.2;
  }
  return buttonPressPlayer;
}

function playButtonPressSound() {
  if (Platform.OS === "web") {
    return;
  }
  const now = Date.now();
  if (now - lastButtonFeedbackAt < 48) {
    return;
  }
  lastButtonFeedbackAt = now;
  try {
    const player = getButtonPressPlayer();
    try {
      player.currentTime = 0;
    } catch {
      // no-op
    }
    player.play();
  } catch {
    // no-op
  }
}

function buildPressedStyle(
  baseStyle: StyleProp<ViewStyle>,
  strong: boolean,
  glowColor: string
): ViewStyle {
  const flattened = StyleSheet.flatten(baseStyle) || {};
  const existingTransform = Array.isArray(flattened.transform)
    ? flattened.transform
    : flattened.transform
    ? [flattened.transform]
    : [];

  return {
    opacity: strong ? 0.9 : 0.95,
    transform: [...existingTransform, { scale: strong ? 0.958 : 0.972 }],
    shadowColor: glowColor,
    shadowOpacity: Platform.OS === "android" ? 0.3 : 0.34,
    shadowRadius: strong ? 18 : 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: strong ? 10 : 8,
    borderColor: flattened.borderWidth || flattened.borderColor ? "rgba(255, 46, 166, 0.46)" : flattened.borderColor,
  };
}

export const FeedbackPressable = forwardRef<React.ElementRef<typeof ReactNativePressable>, FeedbackPressableProps>(
  function FeedbackPressable(
    {
      feedbackHaptics = true,
      feedbackStrong = false,
      feedbackGlowColor = DEFAULT_GLOW_COLOR,
      feedbackDisabledVisuals = false,
      style,
      disabled,
      onPressIn,
      ...props
    },
    ref
  ) {
    const handlePressIn: PressableProps["onPressIn"] = (event) => {
      if (!disabled && feedbackHaptics) {
        Vibration.vibrate(12);
        void Haptics
          .impactAsync(feedbackStrong ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Medium)
          .catch(() => undefined);
        playButtonPressSound();
      }
      onPressIn?.(event);
    };

    const resolveStyle = (state: PressableStateCallbackType) => {
      const baseStyle = typeof style === "function" ? style(state) : style;
      if (!state.pressed || disabled || feedbackDisabledVisuals) {
        return baseStyle;
      }
      return [baseStyle, buildPressedStyle(baseStyle, feedbackStrong, feedbackGlowColor)];
    };

    return <ReactNativePressable ref={ref} disabled={disabled} onPressIn={handlePressIn} style={resolveStyle} {...props} />;
  }
);

import React, { useEffect, useMemo, useRef, useState } from "react";
import * as Haptics from "expo-haptics";
import {
  Animated,
  Keyboard,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from "react-native";

import { useTerminalKeyboard } from "../hooks/useTerminalKeyboard";
import { styles } from "../theme/styles";

type TerminalKeyboardBarProps = {
  visible?: boolean;
  onInsertText: (text: string) => void;
  onControlChar?: (char: string) => void;
  onAction: (action: string) => void;
  compact?: boolean;
};

type KeyDef = {
  id: string;
  label: string;
  payloadKey?: string;
  action?: string;
  a11yLabel: string;
  a11yHint?: string;
};

const LAYER_ESSENTIALS: KeyDef[] = [
  { id: "tab", label: "Tab", payloadKey: "tab", a11yLabel: "Tab key" },
  { id: "esc", label: "Esc", payloadKey: "esc", a11yLabel: "Escape key" },
  {
    id: "ctrl",
    label: "Ctrl",
    a11yLabel: "Control key",
    a11yHint: "Double tap to lock, tap again to unlock.",
  },
  {
    id: "alt",
    label: "Alt",
    a11yLabel: "Alt key",
    a11yHint: "Double tap to lock, tap again to unlock.",
  },
  { id: "up", label: "↑", payloadKey: "up", a11yLabel: "History previous key" },
  { id: "down", label: "↓", payloadKey: "down", a11yLabel: "History next key" },
  { id: "left", label: "←", payloadKey: "left", a11yLabel: "Cursor left key" },
  { id: "right", label: "→", payloadKey: "right", a11yLabel: "Cursor right key" },
  { id: "pipe", label: "|", payloadKey: "|", a11yLabel: "Pipe symbol" },
  { id: "amp", label: "&", payloadKey: "&", a11yLabel: "Ampersand symbol" },
  { id: "dollar", label: "$", payloadKey: "$", a11yLabel: "Dollar symbol" },
  { id: "bang", label: "!", payloadKey: "!", a11yLabel: "Exclamation symbol" },
];

const LAYER_SYMBOLS: KeyDef[] = [
  { id: "slash", label: "/", payloadKey: "/", a11yLabel: "Slash symbol" },
  { id: "tilde", label: "~", payloadKey: "~", a11yLabel: "Tilde symbol" },
  { id: "dash", label: "-", payloadKey: "-", a11yLabel: "Dash symbol" },
  { id: "underscore", label: "_", payloadKey: "_", a11yLabel: "Underscore symbol" },
  { id: "dot", label: ".", payloadKey: ".", a11yLabel: "Dot symbol" },
  { id: "colon", label: ":", payloadKey: ":", a11yLabel: "Colon symbol" },
  { id: "semicolon", label: ";", payloadKey: ";", a11yLabel: "Semicolon symbol" },
  { id: "doublequote", label: '"', payloadKey: '"', a11yLabel: "Double quote symbol" },
  { id: "singlequote", label: "'", payloadKey: "'", a11yLabel: "Single quote symbol" },
  { id: "star", label: "*", payloadKey: "*", a11yLabel: "Asterisk symbol" },
  { id: "gt", label: ">", payloadKey: ">", a11yLabel: "Greater than symbol" },
  { id: "lt", label: "<", payloadKey: "<", a11yLabel: "Less than symbol" },
  { id: "append", label: ">>", payloadKey: ">>", a11yLabel: "Append redirect symbols" },
  { id: "andand", label: "&&", payloadKey: "&&", a11yLabel: "Logical and symbols" },
  { id: "oror", label: "||", payloadKey: "||", a11yLabel: "Logical or symbols" },
  { id: "semi2", label: ";;", payloadKey: ";;", a11yLabel: "Double semicolon symbols" },
];

const LAYER_FUNCTIONS: KeyDef[] = [
  { id: "f1", label: "F1", payloadKey: "f1", a11yLabel: "F1 function key" },
  { id: "f2", label: "F2", payloadKey: "f2", a11yLabel: "F2 function key" },
  { id: "f3", label: "F3", payloadKey: "f3", a11yLabel: "F3 function key" },
  { id: "f4", label: "F4", payloadKey: "f4", a11yLabel: "F4 function key" },
  { id: "f5", label: "F5", payloadKey: "f5", a11yLabel: "F5 function key" },
  { id: "f6", label: "F6", payloadKey: "f6", a11yLabel: "F6 function key" },
  { id: "f7", label: "F7", payloadKey: "f7", a11yLabel: "F7 function key" },
  { id: "f8", label: "F8", payloadKey: "f8", a11yLabel: "F8 function key" },
  { id: "f9", label: "F9", payloadKey: "f9", a11yLabel: "F9 function key" },
  { id: "f10", label: "F10", payloadKey: "f10", a11yLabel: "F10 function key" },
  { id: "f11", label: "F11", payloadKey: "f11", a11yLabel: "F11 function key" },
  { id: "f12", label: "F12", payloadKey: "f12", a11yLabel: "F12 function key" },
];

const LAYER_COMBOS: KeyDef[] = [
  { id: "ctrlc", label: "Ctrl+C", payloadKey: "ctrl+c", a11yLabel: "Control C", a11yHint: "Interrupts the running process." },
  { id: "ctrld", label: "Ctrl+D", payloadKey: "ctrl+d", a11yLabel: "Control D", a11yHint: "Sends end-of-file to close input." },
  { id: "ctrlz", label: "Ctrl+Z", payloadKey: "ctrl+z", a11yLabel: "Control Z", a11yHint: "Suspends the current process." },
  { id: "ctrll", label: "Ctrl+L", payloadKey: "ctrl+l", a11yLabel: "Control L", a11yHint: "Clears the terminal screen." },
  { id: "ctrla", label: "Ctrl+A", payloadKey: "ctrl+a", a11yLabel: "Control A", a11yHint: "Moves cursor to the start of line." },
  { id: "ctrle", label: "Ctrl+E", payloadKey: "ctrl+e", a11yLabel: "Control E", a11yHint: "Moves cursor to the end of line." },
  { id: "ctrlr", label: "Ctrl+R", payloadKey: "ctrl+r", a11yLabel: "Control R", a11yHint: "Opens reverse history search." },
  { id: "ctrlw", label: "Ctrl+W", payloadKey: "ctrl+w", a11yLabel: "Control W", a11yHint: "Deletes one word backwards." },
];

function controlFallbackText(value: string): string {
  if (value === "\u001b") {
    return "^[";
  }
  if (value.length === 1) {
    const code = value.charCodeAt(0);
    if (code > 0 && code <= 26) {
      return `^${String.fromCharCode(64 + code)}`;
    }
  }
  return value;
}

function KeyboardKey({
  keyDef,
  onPress,
  active,
  locked,
}: {
  keyDef: KeyDef;
  onPress: () => void;
  active?: boolean;
  locked?: boolean;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!locked) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 520, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 520, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => {
      loop.stop();
      pulse.setValue(0);
    };
  }, [locked, pulse]);

  const lockedScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.035] });

  return (
    <Animated.View style={locked ? { transform: [{ scale: lockedScale }] } : undefined}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={keyDef.a11yLabel}
        accessibilityHint={keyDef.a11yHint}
        accessibilityState={active ? { selected: true } : undefined}
        style={[
          styles.keyboardBarKeyButton,
          active ? styles.keyboardBarKeyButtonActive : null,
          locked ? styles.keyboardBarKeyButtonLocked : null,
        ]}
        onPress={onPress}
      >
        <Text style={styles.keyboardBarKeyText}>{keyDef.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

function KeyboardKeyRow({
  keys,
  onPressKey,
  ctrlActive,
  ctrlLocked,
  altActive,
  altLocked,
}: {
  keys: KeyDef[];
  onPressKey: (key: KeyDef) => void;
  ctrlActive: boolean;
  ctrlLocked: boolean;
  altActive: boolean;
  altLocked: boolean;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.keyboardBarScrollContent}>
      {keys.map((keyDef) => {
        const isCtrl = keyDef.id === "ctrl";
        const isAlt = keyDef.id === "alt";
        return (
          <KeyboardKey
            key={keyDef.id}
            keyDef={keyDef}
            onPress={() => onPressKey(keyDef)}
            active={isCtrl ? ctrlActive : isAlt ? altActive : false}
            locked={isCtrl ? ctrlLocked : isAlt ? altLocked : false}
          />
        );
      })}
    </ScrollView>
  );
}

export function TerminalKeyboardBar({
  visible = true,
  onInsertText,
  onControlChar,
  onAction,
  compact = false,
}: TerminalKeyboardBarProps) {
  const { state, setActiveLayer, toggleCtrl, toggleAlt, buildKeyPayload } = useTerminalKeyboard();
  const [keyboardVisible, setKeyboardVisible] = useState<boolean>(Platform.OS === "web");
  const [keyAreaWidth, setKeyAreaWidth] = useState<number>(1);
  const layerAnimation = useRef(new Animated.Value(0)).current;
  const currentLayerRef = useRef<0 | 1 | 2>(0);

  const currentLayer = compact ? 0 : state.activeLayer;
  currentLayerRef.current = currentLayer;

  useEffect(() => {
    const showSub = Keyboard.addListener("keyboardDidShow", () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener("keyboardDidHide", () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  useEffect(() => {
    Animated.timing(layerAnimation, {
      toValue: currentLayer,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [currentLayer, layerAnimation]);

  const onPressKey = (key: KeyDef) => {
    if (Platform.OS !== "web") {
      void Haptics.selectionAsync().catch(() => undefined);
    }
    if (key.id === "ctrl") {
      toggleCtrl();
      return;
    }
    if (key.id === "alt") {
      toggleAlt();
      return;
    }
    if (key.action) {
      onAction(key.action);
      return;
    }

    const payload = buildKeyPayload(key.payloadKey || key.label);
    if (payload.action) {
      onAction(payload.action);
      return;
    }
    if (payload.controlChar) {
      if (onControlChar) {
        onControlChar(payload.controlChar);
        return;
      }
      onInsertText(controlFallbackText(payload.controlChar));
      return;
    }
    if (payload.text) {
      onInsertText(payload.text);
    }
  };

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          !compact && Math.abs(gestureState.dx) > Math.abs(gestureState.dy) && Math.abs(gestureState.dx) > 10,
        onPanResponderRelease: (_, gestureState) => {
          if (compact) {
            return;
          }
          const layer = currentLayerRef.current;
          if (gestureState.dx <= -24) {
            setActiveLayer((Math.min(2, layer + 1) as 0 | 1 | 2));
            return;
          }
          if (gestureState.dx >= 24) {
            setActiveLayer((Math.max(0, layer - 1) as 0 | 1 | 2));
          }
        },
      }),
    [compact, setActiveLayer]
  );

  if (!visible || !keyboardVisible) {
    return null;
  }

  const translateX = layerAnimation.interpolate({
    inputRange: [0, 1, 2],
    outputRange: [0, -keyAreaWidth, -keyAreaWidth * 2],
  });

  return (
    <View style={styles.keyboardBarContainer}>
      {!compact ? (
        <View style={styles.keyboardBarTabs}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Keyboard essentials layer"
            style={[styles.keyboardBarTab, currentLayer === 0 ? styles.keyboardBarTabActive : null]}
            onPress={() => setActiveLayer(0)}
          >
            <Text style={styles.keyboardBarTabText}>⌨</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Symbols layer"
            style={[styles.keyboardBarTab, currentLayer === 1 ? styles.keyboardBarTabActive : null]}
            onPress={() => setActiveLayer(1)}
          >
            <Text style={styles.keyboardBarTabText}>#</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Function keys layer"
            style={[styles.keyboardBarTab, currentLayer === 2 ? styles.keyboardBarTabActive : null]}
            onPress={() => setActiveLayer(2)}
          >
            <Text style={styles.keyboardBarTabText}>ƒ</Text>
          </Pressable>
        </View>
      ) : null}

      <View
        style={styles.keyboardBarLayersViewport}
        onLayout={(event) => {
          const width = Math.max(1, Math.round(event.nativeEvent.layout.width));
          if (width !== keyAreaWidth) {
            setKeyAreaWidth(width);
          }
        }}
        {...panResponder.panHandlers}
      >
        {compact ? (
          <KeyboardKeyRow
            keys={LAYER_ESSENTIALS}
            onPressKey={onPressKey}
            ctrlActive={state.ctrlActive}
            ctrlLocked={state.ctrlLocked}
            altActive={state.altActive}
            altLocked={state.altLocked}
          />
        ) : (
          <Animated.View
            style={[
              styles.keyboardBarAnimatedTrack,
              {
                width: keyAreaWidth * 3,
                transform: [{ translateX }],
              },
            ]}
          >
            <View style={{ width: keyAreaWidth }}>
              <KeyboardKeyRow
                keys={LAYER_ESSENTIALS}
                onPressKey={onPressKey}
                ctrlActive={state.ctrlActive}
                ctrlLocked={state.ctrlLocked}
                altActive={state.altActive}
                altLocked={state.altLocked}
              />
            </View>
            <View style={{ width: keyAreaWidth }}>
              <KeyboardKeyRow
                keys={LAYER_SYMBOLS}
                onPressKey={onPressKey}
                ctrlActive={state.ctrlActive}
                ctrlLocked={state.ctrlLocked}
                altActive={state.altActive}
                altLocked={state.altLocked}
              />
            </View>
            <View style={{ width: keyAreaWidth }}>
              <View>
                <KeyboardKeyRow
                  keys={LAYER_FUNCTIONS}
                  onPressKey={onPressKey}
                  ctrlActive={state.ctrlActive}
                  ctrlLocked={state.ctrlLocked}
                  altActive={state.altActive}
                  altLocked={state.altLocked}
                />
                <KeyboardKeyRow
                  keys={LAYER_COMBOS}
                  onPressKey={onPressKey}
                  ctrlActive={state.ctrlActive}
                  ctrlLocked={state.ctrlLocked}
                  altActive={state.altActive}
                  altLocked={state.altLocked}
                />
              </View>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}

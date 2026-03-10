import React, { useEffect, useMemo, useRef, useState } from "react";
import { Image, PanResponder, Pressable, ScrollView, Switch, Text, TextInput, useWindowDimensions, View } from "react-native";

import { BRAND_LOGO } from "../branding";
import { NovaAssistantMessage } from "../novaAssistant";
import { styles } from "../theme/styles";

type NovaAssistantOverlayProps = {
  messages: NovaAssistantMessage[];
  draft: string;
  busy: boolean;
  lastError: string | null;
  activeProfileName: string | null;
  canSend: boolean;
  voiceRecording: boolean;
  voiceBusy: boolean;
  listeningActive: boolean;
  handsFreeEnabled: boolean;
  voiceModeEnabled: boolean;
  wakePhrase: string;
  openRequestToken: number;
  onSetDraft: (value: string) => void;
  onSend: () => void;
  onClose: () => void;
  onClearConversation: () => void;
  onOpenProviders: () => void;
  onSetHandsFreeEnabled: (value: boolean) => void;
  onToggleVoiceMode: () => void;
  onVoiceHoldStart: () => void;
  onVoiceHoldEnd: () => void;
};

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

const BUTTON_SIZE = 56;
const BUTTON_MARGIN = 18;

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function defaultPanelRect(width: number, height: number): Rect {
  const panelWidth = Math.min(440, Math.max(width - 32, 320));
  const panelHeight = Math.min(560, Math.max(height - 180, 320));
  return {
    x: clamp(width - panelWidth - 18, 12, Math.max(12, width - panelWidth - 12)),
    y: clamp(height - panelHeight - 120, 80, Math.max(80, height - panelHeight - 20)),
    width: panelWidth,
    height: panelHeight,
  };
}

function defaultButtonPosition(width: number, height: number) {
  return {
    x: Math.max(BUTTON_MARGIN, width - BUTTON_SIZE - BUTTON_MARGIN),
    y: Math.max(92, height - BUTTON_SIZE - 108),
  };
}

export function NovaAssistantOverlay({
  messages,
  draft,
  busy,
  lastError,
  activeProfileName,
  canSend,
  voiceRecording,
  voiceBusy,
  listeningActive,
  handsFreeEnabled,
  voiceModeEnabled,
  wakePhrase,
  openRequestToken,
  onSetDraft,
  onSend,
  onClose,
  onClearConversation,
  onOpenProviders,
  onSetHandsFreeEnabled,
  onToggleVoiceMode,
  onVoiceHoldStart,
  onVoiceHoldEnd,
}: NovaAssistantOverlayProps) {
  const { width, height } = useWindowDimensions();
  const [open, setOpen] = useState<boolean>(false);
  const [fullscreen, setFullscreen] = useState<boolean>(false);
  const [buttonPosition, setButtonPosition] = useState(() => defaultButtonPosition(width, height));
  const [panelRect, setPanelRect] = useState<Rect>(() => defaultPanelRect(width, height));
  const skipTapAfterHoldRef = useRef<boolean>(false);
  const buttonOriginRef = useRef(buttonPosition);
  const panelOriginRef = useRef(panelRect);
  const resizeOriginRef = useRef(panelRect);

  useEffect(() => {
    buttonOriginRef.current = buttonPosition;
  }, [buttonPosition]);

  useEffect(() => {
    panelOriginRef.current = panelRect;
    resizeOriginRef.current = panelRect;
  }, [panelRect]);

  useEffect(() => {
    setButtonPosition((current) => ({
      x: clamp(current.x, BUTTON_MARGIN, Math.max(BUTTON_MARGIN, width - BUTTON_SIZE - BUTTON_MARGIN)),
      y: clamp(current.y, 76, Math.max(92, height - BUTTON_SIZE - 86)),
    }));
    setPanelRect((current) => {
      const nextWidth = clamp(current.width, 320, Math.max(320, width - 24));
      const nextHeight = clamp(current.height, 320, Math.max(320, height - 40));
      return {
        x: clamp(current.x, 8, Math.max(8, width - nextWidth - 8)),
        y: clamp(current.y, 50, Math.max(50, height - nextHeight - 8)),
        width: nextWidth,
        height: nextHeight,
      };
    });
  }, [height, width]);

  useEffect(() => {
    if (!openRequestToken) {
      return;
    }
    setOpen(true);
  }, [openRequestToken]);

  const buttonPanResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          buttonOriginRef.current = buttonPosition;
        },
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dx) > 5 || Math.abs(gesture.dy) > 5,
        onPanResponderMove: (_event, gesture) => {
          const origin = buttonOriginRef.current;
          setButtonPosition({
            x: clamp(origin.x + gesture.dx, BUTTON_MARGIN, Math.max(BUTTON_MARGIN, width - BUTTON_SIZE - BUTTON_MARGIN)),
            y: clamp(origin.y + gesture.dy, 76, Math.max(92, height - BUTTON_SIZE - 86)),
          });
        },
      }),
    [buttonPosition, height, width]
  );

  const panelDragResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          panelOriginRef.current = panelRect;
        },
        onMoveShouldSetPanResponder: () => !fullscreen,
        onPanResponderMove: (_event, gesture) => {
          if (fullscreen) {
            return;
          }
          const origin = panelOriginRef.current;
          setPanelRect({
            ...origin,
            x: clamp(origin.x + gesture.dx, 8, Math.max(8, width - origin.width - 8)),
            y: clamp(origin.y + gesture.dy, 50, Math.max(50, height - origin.height - 8)),
          });
        },
      }),
    [fullscreen, height, panelRect, width]
  );

  const resizeResponder = useMemo(
    () =>
      PanResponder.create({
        onPanResponderGrant: () => {
          resizeOriginRef.current = panelRect;
        },
        onMoveShouldSetPanResponder: () => !fullscreen,
        onPanResponderMove: (_event, gesture) => {
          if (fullscreen) {
            return;
          }
          const origin = resizeOriginRef.current;
          const nextWidth = clamp(origin.width + gesture.dx, 320, Math.max(320, width - origin.x - 8));
          const nextHeight = clamp(origin.height + gesture.dy, 320, Math.max(320, height - origin.y - 8));
          setPanelRect({
            ...origin,
            width: nextWidth,
            height: nextHeight,
          });
        },
      }),
    [fullscreen, height, panelRect, width]
  );

  const shellStyle = fullscreen
    ? styles.novaOverlayPanelFullscreen
    : [
        styles.novaOverlayPanel,
        {
          left: panelRect.x,
          top: panelRect.y,
          width: panelRect.width,
          height: panelRect.height,
        },
      ];

  const visibleMessages = messages.slice(-18);

  return (
    <View pointerEvents="box-none" style={styles.novaOverlayRoot}>
      {open ? (
        <View pointerEvents="box-none" style={styles.novaOverlayRoot}>
          <View style={shellStyle}>
            <View style={styles.novaOverlayHeader} {...panelDragResponder.panHandlers}>
              <View style={styles.novaOverlayHeaderMeta}>
                <Text style={styles.novaOverlayTitle}>Nova</Text>
                <Text numberOfLines={1} style={styles.novaOverlaySubtitle}>
                  {activeProfileName ? `Using ${activeProfileName}` : "No provider selected"}
                </Text>
              </View>
              <View style={styles.novaOverlayHeaderActions}>
                <View style={styles.novaOverlayToggleWrap}>
                  <Text style={styles.novaOverlayToggleLabel}>Hands-Free</Text>
                  <Switch
                    accessibilityLabel={handsFreeEnabled ? "Disable Nova hands-free voice" : "Enable Nova hands-free voice"}
                    value={handsFreeEnabled}
                    onValueChange={onSetHandsFreeEnabled}
                    thumbColor={handsFreeEnabled ? "#dff8ff" : "#d7dcec"}
                    trackColor={{
                      false: "rgba(58, 73, 109, 0.9)",
                      true: "rgba(41, 172, 217, 0.92)",
                    }}
                  />
                </View>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={fullscreen ? "Exit Nova fullscreen" : "Open Nova fullscreen"}
                  style={styles.novaOverlayHeaderButton}
                  onPress={() => {
                    if (fullscreen) {
                      setFullscreen(false);
                      return;
                    }
                    setPanelRect(defaultPanelRect(width, height));
                    setFullscreen(true);
                  }}
                >
                  <Text style={styles.novaOverlayHeaderButtonText}>{fullscreen ? "Window" : "Full"}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Close Nova assistant"
                  style={styles.novaOverlayHeaderButton}
                  onPress={() => {
                    setOpen(false);
                    onClose();
                  }}
                >
                  <Text style={styles.novaOverlayHeaderButtonText}>Close</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.novaOverlayStatusRow}>
              <Text style={styles.novaOverlayHint}>
                {voiceRecording
                  ? "Listening..."
                  : voiceBusy
                    ? "Transcribing..."
                    : voiceModeEnabled
                      ? "Voice mode stays live. Speak naturally and Nova will keep listening."
                      : handsFreeEnabled
                        ? "Hands-Free keeps Nova in an always-on conversation."
                        : `Say "${wakePhrase}" to wake Nova, hold the orb like a walkie, or tap Voice in chat.`}
              </Text>
              {!canSend ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open AI provider settings"
                  style={styles.novaInlineButton}
                  onPress={onOpenProviders}
                >
                  <Text style={styles.novaInlineButtonText}>Providers</Text>
                </Pressable>
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Clear Nova conversation"
                  style={styles.novaInlineButton}
                  onPress={onClearConversation}
                >
                  <Text style={styles.novaInlineButtonText}>Clear</Text>
                </Pressable>
              )}
            </View>

            {lastError ? <Text style={styles.novaOverlayError}>{lastError}</Text> : null}

            <ScrollView
              style={styles.novaOverlayTranscript}
              contentContainerStyle={styles.novaOverlayTranscriptContent}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              {visibleMessages.map((message) => (
                <View
                  key={message.id}
                  style={[
                    styles.novaMessageBubble,
                    message.role === "user" ? styles.novaMessageBubbleUser : styles.novaMessageBubbleAssistant,
                  ]}
                >
                  <Text style={styles.novaMessageRole}>{message.role === "user" ? "You" : "Nova"}</Text>
                  <Text style={styles.novaMessageText}>{message.content}</Text>
                </View>
              ))}
            </ScrollView>

            <View style={styles.novaOverlayComposer}>
              <TextInput
                accessibilityLabel="Nova prompt"
                value={draft}
                onChangeText={onSetDraft}
                placeholder="Ask Nova to do something..."
                placeholderTextColor="#6075a5"
                style={[styles.input, styles.novaComposerInput]}
                multiline
              />
              <View style={styles.novaOverlayComposerActions}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={voiceModeEnabled ? "Stop Nova voice mode" : "Start Nova voice mode"}
                  style={[
                    styles.novaComposerButton,
                    voiceModeEnabled || voiceRecording ? styles.novaComposerButtonVoiceActive : null,
                    voiceBusy ? styles.buttonDisabled : null,
                  ]}
                  disabled={voiceBusy}
                  onPress={onToggleVoiceMode}
                >
                  <Text style={styles.novaComposerButtonText}>
                    {voiceRecording ? "Listening" : voiceModeEnabled ? "Voice On" : "Voice"}
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Send Nova prompt"
                  style={[
                    styles.novaComposerButton,
                    styles.novaComposerButtonPrimary,
                    busy || !draft.trim() || !canSend ? styles.buttonDisabled : null,
                  ]}
                  disabled={busy || !draft.trim() || !canSend}
                  onPress={onSend}
                >
                  <Text style={styles.novaComposerButtonText}>{busy ? "Running" : "Send"}</Text>
                </Pressable>
              </View>
            </View>

            {!fullscreen ? <View style={styles.novaResizeHandle} {...resizeResponder.panHandlers} /> : null}
          </View>
        </View>
      ) : null}

      <View
        pointerEvents="box-none"
        style={[
          styles.novaFloatingButtonWrap,
          {
            left: buttonPosition.x,
            top: buttonPosition.y,
          },
        ]}
        {...buttonPanResponder.panHandlers}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={voiceRecording ? "Stop Nova voice input" : "Open Nova assistant"}
          accessibilityHint="Tap to open Nova. Press and hold to talk."
          delayLongPress={420}
          hitSlop={10}
          style={[
            styles.novaFloatingButton,
            open ? styles.novaFloatingButtonActive : null,
            voiceBusy ? styles.buttonDisabled : null,
          ]}
          disabled={voiceBusy}
          onLongPress={() => {
            skipTapAfterHoldRef.current = true;
            setOpen(true);
            onVoiceHoldStart();
          }}
          onPressOut={() => {
            if (!skipTapAfterHoldRef.current) {
              return;
            }
            onVoiceHoldEnd();
            skipTapAfterHoldRef.current = false;
          }}
          onPress={() => {
            if (skipTapAfterHoldRef.current) {
              skipTapAfterHoldRef.current = false;
              return;
            }
            setOpen(true);
          }}
        >
          <View
            pointerEvents="none"
            style={[
              styles.novaFloatingButtonIndicator,
              listeningActive ? styles.novaFloatingButtonIndicatorActive : null,
            ]}
          />
          <View style={styles.novaFloatingButtonImageWrap}>
            <Image source={BRAND_LOGO} style={styles.novaFloatingButtonImage} resizeMode="contain" />
          </View>
        </Pressable>
      </View>
    </View>
  );
}

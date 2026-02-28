import React, { useState } from "react";
import { Modal, Pressable, SafeAreaView, Text, View } from "react-native";

import { styles } from "../theme/styles";

const STEPS = [
  {
    title: "Terminals Tab",
    body: "Start sessions, stream output live, and send commands from each terminal card.",
  },
  {
    title: "Servers Tab",
    body: "Manage profiles, share server configs without tokens, and control biometric lock.",
  },
  {
    title: "Fullscreen Tools",
    body: "Search terminal output, recall command history, and switch AI/Shell mode quickly.",
  },
  {
    title: "Snippets + Pro",
    body: "Save reusable commands/prompts, unlock split view, and expand server/session limits.",
  },
];

type TutorialModalProps = {
  visible: boolean;
  onDone: () => void;
};

export function TutorialModal({ visible, onDone }: TutorialModalProps) {
  const [index, setIndex] = useState<number>(0);

  const step = STEPS[index];
  if (!visible) {
    return null;
  }

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDone}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.panelLabel}>{`Quick Tour ${index + 1}/${STEPS.length}`}</Text>
          <Text style={styles.title}>{step.title}</Text>
          <Text style={styles.serverSubtitle}>{step.body}</Text>

          <View style={styles.rowInlineSpace}>
            {index > 0 ? (
              <Pressable accessibilityRole="button" style={[styles.buttonGhost, styles.flexButton]} onPress={() => setIndex((prev) => prev - 1)}>
                <Text style={styles.buttonGhostText}>Back</Text>
              </Pressable>
            ) : null}

            {index < STEPS.length - 1 ? (
              <Pressable accessibilityRole="button" style={[styles.buttonPrimary, styles.flexButton]} onPress={() => setIndex((prev) => prev + 1)}>
                <Text style={styles.buttonPrimaryText}>Next</Text>
              </Pressable>
            ) : (
              <Pressable accessibilityRole="button"
                style={[styles.buttonPrimary, styles.flexButton]}
                onPress={() => {
                  setIndex(0);
                  onDone();
                }}
              >
                <Text style={styles.buttonPrimaryText}>Start Using App</Text>
              </Pressable>
            )}
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

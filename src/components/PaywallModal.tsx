import React from "react";
import { Modal, SafeAreaView, Text, View } from "react-native";
import { FeedbackPressable as Pressable } from "./FeedbackPressable";

import { styles } from "../theme/styles";

type PaywallModalProps = {
  visible: boolean;
  subscriptionTier: "free" | "pro" | "team" | "enterprise";
  proPriceLabel: string | null;
  teamPriceLabel: string | null;
  enterprisePriceLabel: string | null;
  teamSeatCount?: number | null;
  enterpriseSeatCount?: number | null;
  onClose: () => void;
  onUpgradePro: () => void;
  onUpgradeTeam?: () => void;
  onUpgradeEnterprise?: () => void;
  onRestore: () => void;
};

export function PaywallModal({
  visible,
  subscriptionTier,
  proPriceLabel,
  teamPriceLabel,
  enterprisePriceLabel,
  teamSeatCount = null,
  enterpriseSeatCount = null,
  onClose,
  onUpgradePro,
  onUpgradeTeam,
  onUpgradeEnterprise,
  onRestore,
}: PaywallModalProps) {
  const teamSeatLabel = teamSeatCount && teamSeatCount > 0 ? `${teamSeatCount} seats` : "seat-based access";
  const enterpriseSeatLabel =
    enterpriseSeatCount && enterpriseSeatCount > 0 ? `${enterpriseSeatCount} seats` : "unlimited seats";
  const canUpgradeTeam =
    Boolean(onUpgradeTeam && teamPriceLabel) &&
    (subscriptionTier === "free" || subscriptionTier === "pro");
  const canUpgradeEnterprise =
    Boolean(onUpgradeEnterprise && enterprisePriceLabel) &&
    subscriptionTier !== "enterprise";

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <SafeAreaView style={styles.overlayBackdrop}>
        <View style={styles.overlayCard}>
          <Text style={styles.title}>NovaRemote Pro</Text>
          <Text style={styles.serverSubtitle}>
            Unlock AI command assist, fleet execution, watch alerts, glasses mode voice control, file editor, process manager,
            session recordings, offline queue, spectator links, iPad split view, and unlimited servers/sessions.
          </Text>
          <Text style={styles.emptyText}>Free: 1 server, 2 sessions, core terminal controls.</Text>
          <Text style={styles.emptyText}>Pro: unlimited servers/sessions, AI assist, fleet, glasses/VR, recordings.</Text>
          <Text style={styles.emptyText}>{`Team: Pro + shared fleet, role access, token broker, audit logging (${teamSeatLabel}).`}</Text>
          <Text style={styles.emptyText}>{`Enterprise: Team + SSO, ${enterpriseSeatLabel}, compliance controls, SLA support.`}</Text>
          <Text style={styles.serverTitle}>{`Current plan: ${subscriptionTier}`}</Text>
          <Text style={styles.serverSubtitle}>{proPriceLabel ? `Pro ${proPriceLabel}` : "Pro subscription"}</Text>
          {teamPriceLabel ? (
            <Text style={styles.serverSubtitle}>{`Team ${teamPriceLabel}${teamSeatCount ? ` • ${teamSeatLabel}` : ""}`}</Text>
          ) : null}
          {enterprisePriceLabel ? (
            <Text style={styles.serverSubtitle}>{`Enterprise ${enterprisePriceLabel}${enterpriseSeatCount ? ` • ${enterpriseSeatLabel}` : ""}`}</Text>
          ) : null}

          <View style={styles.rowInlineSpace}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to NovaRemote Pro"
              accessibilityHint="Starts the in-app purchase flow."
              style={[styles.buttonPrimary, styles.flexButton]}
              onPress={onUpgradePro}
            >
              <Text style={styles.buttonPrimaryText}>Upgrade</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Restore Pro purchases"
              style={[styles.buttonGhost, styles.flexButton]}
              onPress={onRestore}
            >
              <Text style={styles.buttonGhostText}>Restore</Text>
            </Pressable>
          </View>
          {canUpgradeTeam ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to NovaRemote Team"
              style={styles.actionButton}
              onPress={onUpgradeTeam}
            >
              <Text style={styles.actionButtonText}>Upgrade Team</Text>
            </Pressable>
          ) : null}
          {canUpgradeEnterprise ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Upgrade to NovaRemote Enterprise"
              style={styles.actionButton}
              onPress={onUpgradeEnterprise}
            >
              <Text style={styles.actionButtonText}>Upgrade Enterprise</Text>
            </Pressable>
          ) : null}

          <Pressable accessibilityRole="button" accessibilityLabel="Close paywall" style={styles.buttonGhost} onPress={onClose}>
            <Text style={styles.buttonGhostText}>Maybe Later</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

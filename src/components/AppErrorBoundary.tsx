import React from "react";
import { Pressable, SafeAreaView, Text, View } from "react-native";

import { styles } from "../theme/styles";

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    hasError: false,
    message: "",
  };

  static getDerivedStateFromError(error: unknown): AppErrorBoundaryState {
    return {
      hasError: true,
      message: error instanceof Error ? error.message : "Unknown UI error",
    };
  }

  componentDidCatch(error: unknown) {
    // Keep console logging for native crash diagnostics while rendering fallback UI.
    console.error("NovaRemote boundary caught error:", error);
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centeredWrap}>
          <View style={styles.overlayCard}>
            <Text style={styles.panelLabel}>App Error</Text>
            <Text style={styles.serverTitle}>NovaRemote hit an unexpected error.</Text>
            <Text style={styles.emptyText}>{this.state.message}</Text>
            <Pressable
              style={styles.buttonPrimary}
              onPress={() => {
                this.setState({ hasError: false, message: "" });
              }}
            >
              <Text style={styles.buttonPrimaryText}>Try Recovery</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }
}

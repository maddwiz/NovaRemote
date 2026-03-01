import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Modal, Pressable, SafeAreaView, Text, View } from "react-native";
import { BarcodeScanningResult, CameraView, useCameraPermissions } from "expo-camera";

import { styles } from "../theme/styles";

type QrScannerModalProps = {
  visible: boolean;
  onScanned: (data: string) => void;
  onClose: () => void;
};

export function QrScannerModal({ visible, onScanned, onClose }: QrScannerModalProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const scannedRef = useRef<boolean>(false);

  useEffect(() => {
    if (!visible) {
      scannedRef.current = false;
      return;
    }
    if (!permission) {
      void requestPermission();
    }
  }, [permission, requestPermission, visible]);

  const onBarcodeScanned = (event: BarcodeScanningResult) => {
    if (!visible || scannedRef.current) {
      return;
    }
    scannedRef.current = true;
    onScanned(event.data || "");
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#04020e" }}>
        <View style={{ flex: 1 }}>
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 12 }}>
            <Text style={styles.panelLabel}>Scan QR Code</Text>
            <Text style={styles.serverSubtitle}>Point your camera at a NovaRemote setup QR code.</Text>
          </View>

          {!permission ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 12 }}>
              <ActivityIndicator color="#27d9ff" />
              <Text style={styles.emptyText}>Requesting camera permission...</Text>
            </View>
          ) : !permission.granted ? (
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20, gap: 12 }}>
              <Text style={styles.emptyText}>Camera permission is required to scan setup QR codes.</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Grant camera permission"
                style={styles.buttonPrimary}
                onPress={() => {
                  scannedRef.current = false;
                  void requestPermission();
                }}
              >
                <Text style={styles.buttonPrimaryText}>Grant Camera Access</Text>
              </Pressable>
            </View>
          ) : (
            <View style={{ flex: 1, padding: 16 }}>
              <View style={{ flex: 1, borderRadius: 18, overflow: "hidden", borderWidth: 1, borderColor: "#2a2552" }}>
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={onBarcodeScanned}
                />
                <View
                  pointerEvents="none"
                  style={{
                    position: "absolute",
                    left: "12%",
                    right: "12%",
                    top: "24%",
                    bottom: "24%",
                    borderWidth: 2,
                    borderColor: "#27d9ff",
                    borderRadius: 12,
                    backgroundColor: "transparent",
                  }}
                />
              </View>
            </View>
          )}

          <View style={{ paddingHorizontal: 16, paddingBottom: 18 }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Close QR scanner" style={styles.buttonGhost} onPress={onClose}>
              <Text style={styles.buttonGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

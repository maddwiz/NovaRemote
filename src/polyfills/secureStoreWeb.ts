import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";

type MutableSecureStore = {
  getItemAsync: (key: string) => Promise<string | null>;
  setItemAsync: (key: string, value: string) => Promise<void>;
  deleteItemAsync: (key: string) => Promise<void>;
  isAvailableAsync?: () => Promise<boolean>;
};

let installed = false;

export function installSecureStoreWebFallback() {
  if (installed || Platform.OS !== "web") {
    return;
  }

  installed = true;
  const local = globalThis.localStorage;
  if (!local) {
    return;
  }

  const secureStore = SecureStore as unknown as MutableSecureStore;
  secureStore.getItemAsync = async (key: string) => {
    try {
      return local.getItem(key);
    } catch {
      return null;
    }
  };

  secureStore.setItemAsync = async (key: string, value: string) => {
    try {
      local.setItem(key, value);
    } catch {
      // ignore quota/private-mode failures on web fallback
    }
  };

  secureStore.deleteItemAsync = async (key: string) => {
    try {
      local.removeItem(key);
    } catch {
      // ignore storage access failures on web fallback
    }
  };

  secureStore.isAvailableAsync = async () => true;
}

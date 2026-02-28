import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";

type RevenueCatState = {
  ready: boolean;
  isPro: boolean;
  offerings: PurchasesOfferings | null;
  proPackage: PurchasesPackage | null;
};

const ENTITLEMENT_ID = "pro";

function resolveApiKey(): string | undefined {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  }
  return undefined;
}

function hasPro(info: CustomerInfo | null): boolean {
  if (!info) {
    return false;
  }
  return Boolean(info.entitlements.active[ENTITLEMENT_ID]);
}

export function useRevenueCat() {
  const [state, setState] = useState<RevenueCatState>({
    ready: false,
    isPro: false,
    offerings: null,
    proPackage: null,
  });
  const [available, setAvailable] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      const apiKey = resolveApiKey();
      if (!apiKey) {
        if (mounted) {
          setState((prev) => ({ ...prev, ready: true }));
        }
        return;
      }

      setAvailable(true);

      try {
        Purchases.setLogLevel(LOG_LEVEL.WARN);
        await Purchases.configure({ apiKey });

        const [customerInfo, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);

        if (!mounted) {
          return;
        }

        const current = offerings.current;
        const proPackage = current?.monthly || current?.annual || current?.availablePackages?.[0] || null;

        setState({
          ready: true,
          isPro: hasPro(customerInfo),
          offerings,
          proPackage,
        });
      } catch {
        if (mounted) {
          setState((prev) => ({ ...prev, ready: true }));
        }
      }
    }

    void setup();

    return () => {
      mounted = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!available) {
      return;
    }

    const [customerInfo, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
    const current = offerings.current;
    const proPackage = current?.monthly || current?.annual || current?.availablePackages?.[0] || null;

    setState((prev) => ({
      ...prev,
      isPro: hasPro(customerInfo),
      offerings,
      proPackage,
    }));
  }, [available]);

  const purchasePro = useCallback(async () => {
    if (!state.proPackage) {
      throw new Error("No pro package is available.");
    }

    const result = await Purchases.purchasePackage(state.proPackage);
    const pro = hasPro(result.customerInfo);
    setState((prev) => ({ ...prev, isPro: pro }));
    return pro;
  }, [state.proPackage]);

  const restore = useCallback(async () => {
    const info = await Purchases.restorePurchases();
    const pro = hasPro(info);
    setState((prev) => ({ ...prev, isPro: pro }));
    return pro;
  }, []);

  const priceLabel = useMemo(() => {
    return state.proPackage?.product.priceString || null;
  }, [state.proPackage]);

  return {
    available,
    ready: state.ready,
    isPro: state.isPro,
    offerings: state.offerings,
    proPackage: state.proPackage,
    priceLabel,
    refresh,
    purchasePro,
    restore,
  };
}

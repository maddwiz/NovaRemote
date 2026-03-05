import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import Purchases, { CustomerInfo, LOG_LEVEL, PurchasesOfferings, PurchasesPackage } from "react-native-purchases";

type SubscriptionTier = "free" | "pro" | "team" | "enterprise";

type RevenueCatState = {
  ready: boolean;
  isPro: boolean;
  isTeam: boolean;
  isEnterprise: boolean;
  subscriptionTier: SubscriptionTier;
  offerings: PurchasesOfferings | null;
  proPackage: PurchasesPackage | null;
};

function entitlementId(envKey: string, fallback: string): string {
  const raw = typeof process !== "undefined" ? process.env[envKey] || "" : "";
  return raw.trim() || fallback;
}

const PRO_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_PRO", "pro");
const TEAM_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_TEAM", "team");
const ENTERPRISE_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_ENTERPRISE", "enterprise");

function resolveApiKey(): string | undefined {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  }
  return undefined;
}

function resolveTier(info: CustomerInfo | null): { isPro: boolean; isTeam: boolean; isEnterprise: boolean; subscriptionTier: SubscriptionTier } {
  const active = info?.entitlements.active || {};
  const isEnterprise = Boolean(active[ENTERPRISE_ENTITLEMENT_ID]);
  const isTeam = Boolean(active[TEAM_ENTITLEMENT_ID]);
  const hasProOnly = Boolean(active[PRO_ENTITLEMENT_ID]);

  if (isEnterprise) {
    return {
      isPro: true,
      isTeam: true,
      isEnterprise: true,
      subscriptionTier: "enterprise",
    };
  }

  if (isTeam) {
    return {
      isPro: true,
      isTeam: true,
      isEnterprise: false,
      subscriptionTier: "team",
    };
  }

  if (hasProOnly) {
    return {
      isPro: true,
      isTeam: false,
      isEnterprise: false,
      subscriptionTier: "pro",
    };
  }

  return {
    isPro: false,
    isTeam: false,
    isEnterprise: false,
    subscriptionTier: "free",
  };
}

export function useRevenueCat() {
  const [state, setState] = useState<RevenueCatState>({
    ready: false,
    isPro: false,
    isTeam: false,
    isEnterprise: false,
    subscriptionTier: "free",
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
        const tier = resolveTier(customerInfo);

        setState({
          ready: true,
          ...tier,
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
    const tier = resolveTier(customerInfo);

    setState((prev) => ({
      ...prev,
      ...tier,
      offerings,
      proPackage,
    }));
  }, [available]);

  const purchasePro = useCallback(async () => {
    if (!state.proPackage) {
      throw new Error("No pro package is available.");
    }

    const result = await Purchases.purchasePackage(state.proPackage);
    const tier = resolveTier(result.customerInfo);
    setState((prev) => ({ ...prev, ...tier }));
    return tier.isPro;
  }, [state.proPackage]);

  const restore = useCallback(async () => {
    const info = await Purchases.restorePurchases();
    const tier = resolveTier(info);
    setState((prev) => ({ ...prev, ...tier }));
    return tier.isPro;
  }, []);

  const priceLabel = useMemo(() => {
    return state.proPackage?.product.priceString || null;
  }, [state.proPackage]);

  return {
    available,
    ready: state.ready,
    isPro: state.isPro,
    isTeam: state.isTeam,
    isEnterprise: state.isEnterprise,
    subscriptionTier: state.subscriptionTier,
    isPaid: state.isPro,
    offerings: state.offerings,
    proPackage: state.proPackage,
    priceLabel,
    refresh,
    purchasePro,
    restore,
  };
}

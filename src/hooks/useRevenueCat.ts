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
  teamPackage: PurchasesPackage | null;
  enterprisePackage: PurchasesPackage | null;
};

const FALLBACK_FORCED_SUBSCRIPTION_TIER = "enterprise";

function entitlementId(envKey: string, fallback: string): string {
  const raw = typeof process !== "undefined" ? process.env[envKey] || "" : "";
  return raw.trim() || fallback;
}

function packageId(envKey: string): string {
  const raw = typeof process !== "undefined" ? process.env[envKey] || "" : "";
  return raw.trim().toLowerCase();
}

const PRO_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_PRO", "pro");
const TEAM_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_TEAM", "team");
const ENTERPRISE_ENTITLEMENT_ID = entitlementId("EXPO_PUBLIC_RC_ENTITLEMENT_ENTERPRISE", "enterprise");
const PRO_PACKAGE_ID = packageId("EXPO_PUBLIC_RC_PACKAGE_PRO");
const TEAM_PACKAGE_ID = packageId("EXPO_PUBLIC_RC_PACKAGE_TEAM");
const ENTERPRISE_PACKAGE_ID = packageId("EXPO_PUBLIC_RC_PACKAGE_ENTERPRISE");

function resolveApiKey(): string | undefined {
  if (Platform.OS === "ios") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
  }
  if (Platform.OS === "android") {
    return process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID;
  }
  return undefined;
}

function tierStateFromTier(subscriptionTier: SubscriptionTier): {
  isPro: boolean;
  isTeam: boolean;
  isEnterprise: boolean;
  subscriptionTier: SubscriptionTier;
} {
  if (subscriptionTier === "enterprise") {
    return {
      isPro: true,
      isTeam: true,
      isEnterprise: true,
      subscriptionTier: "enterprise",
    };
  }

  if (subscriptionTier === "team") {
    return {
      isPro: true,
      isTeam: true,
      isEnterprise: false,
      subscriptionTier: "team",
    };
  }

  if (subscriptionTier === "pro") {
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

function resolveTier(info: CustomerInfo | null): { isPro: boolean; isTeam: boolean; isEnterprise: boolean; subscriptionTier: SubscriptionTier } {
  const active = info?.entitlements.active || {};
  const isEnterprise = Boolean(active[ENTERPRISE_ENTITLEMENT_ID]);
  const isTeam = Boolean(active[TEAM_ENTITLEMENT_ID]);
  const hasProOnly = Boolean(active[PRO_ENTITLEMENT_ID]);

  if (isEnterprise) {
    return tierStateFromTier("enterprise");
  }

  if (isTeam) {
    return tierStateFromTier("team");
  }

  if (hasProOnly) {
    return tierStateFromTier("pro");
  }

  return tierStateFromTier("free");
}

function resolveForcedSubscriptionTier(): SubscriptionTier | null {
  const raw =
    typeof process !== "undefined"
      ? process.env.EXPO_PUBLIC_FORCE_SUBSCRIPTION_TIER ||
        process.env.EXPO_PUBLIC_INTERNAL_UNLOCK_TIER ||
        FALLBACK_FORCED_SUBSCRIPTION_TIER
      : FALLBACK_FORCED_SUBSCRIPTION_TIER;
  const normalized = String(raw || "").trim().toLowerCase();

  if (!normalized || normalized === "off" || normalized === "none" || normalized === "false" || normalized === "disabled") {
    return null;
  }

  if (normalized === "pro" || normalized === "team" || normalized === "enterprise") {
    return normalized;
  }

  return "enterprise";
}

function normalize(value: string | undefined | null): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function packageSearchFields(pkg: PurchasesPackage): string[] {
  const raw = pkg as PurchasesPackage & {
    product?: {
      identifier?: string;
      title?: string;
      productCategory?: string;
    };
  };
  return [
    normalize(pkg.identifier),
    normalize(raw.product?.identifier),
    normalize(raw.product?.title),
    normalize(raw.product?.productCategory),
  ].filter(Boolean);
}

function includesToken(pkg: PurchasesPackage, token: string): boolean {
  const normalizedToken = normalize(token);
  if (!normalizedToken) {
    return false;
  }
  const fields = packageSearchFields(pkg);
  return fields.some((field) => field.split(" ").includes(normalizedToken) || field.includes(normalizedToken));
}

function packageMatchesExplicitId(pkg: PurchasesPackage, value: string): boolean {
  if (!value) {
    return false;
  }
  const normalizedValue = normalize(value);
  if (!normalizedValue) {
    return false;
  }
  const fields = packageSearchFields(pkg);
  return fields.some((field) => field === normalizedValue || field.includes(normalizedValue));
}

function extractSeatCountFromText(value: string): number | null {
  const normalizedValue = normalize(value);
  if (!normalizedValue) {
    return null;
  }

  const forwardMatch = normalizedValue.match(/\b(\d+)\s*(seat|seats|user|users|license|licenses)\b/i);
  if (forwardMatch) {
    const parsed = Number.parseInt(forwardMatch[1] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  const reverseMatch = normalizedValue.match(/\b(seat|seats|user|users|license|licenses)\s*(\d+)\b/i);
  if (reverseMatch) {
    const parsed = Number.parseInt(reverseMatch[2] || "", 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  return null;
}

function extractSeatCount(pkg: PurchasesPackage | null): number | null {
  if (!pkg) {
    return null;
  }
  const raw = pkg as PurchasesPackage & {
    product?: {
      identifier?: string;
      title?: string;
      description?: string;
    };
  };
  const candidates = [pkg.identifier, raw.product?.identifier, raw.product?.title, raw.product?.description];
  for (const candidate of candidates) {
    if (!candidate) {
      continue;
    }
    const parsed = extractSeatCountFromText(candidate);
    if (parsed) {
      return parsed;
    }
  }
  return null;
}

function classifyPackages(offerings: PurchasesOfferings | null): {
  proPackage: PurchasesPackage | null;
  teamPackage: PurchasesPackage | null;
  enterprisePackage: PurchasesPackage | null;
} {
  const current = offerings?.current;
  const available = current?.availablePackages || [];

  const matchesTeam = (pkg: PurchasesPackage) => includesToken(pkg, "team");
  const matchesEnterprise = (pkg: PurchasesPackage) => includesToken(pkg, "enterprise");
  const matchesPro = (pkg: PurchasesPackage) => includesToken(pkg, "pro");

  const enterprisePackage =
    available.find((pkg) => packageMatchesExplicitId(pkg, ENTERPRISE_PACKAGE_ID)) ||
    available.find((pkg) => matchesEnterprise(pkg)) ||
    null;

  const teamPackage =
    available.find((pkg) => packageMatchesExplicitId(pkg, TEAM_PACKAGE_ID)) ||
    available.find((pkg) => matchesTeam(pkg)) ||
    null;

  const explicitPro =
    available.find((pkg) => packageMatchesExplicitId(pkg, PRO_PACKAGE_ID)) ||
    null;

  const monthly = current?.monthly || null;
  const annual = current?.annual || null;
  const defaultProCandidate = [monthly, annual, ...available].find((pkg) => {
    if (!pkg) {
      return false;
    }
    if (enterprisePackage && pkg.identifier === enterprisePackage.identifier) {
      return false;
    }
    if (teamPackage && pkg.identifier === teamPackage.identifier) {
      return false;
    }
    return true;
  }) || null;

  const proPackage =
    explicitPro ||
    available.find((pkg) => matchesPro(pkg) && !matchesTeam(pkg) && !matchesEnterprise(pkg)) ||
    defaultProCandidate;

  return {
    proPackage,
    teamPackage,
    enterprisePackage,
  };
}

export function useRevenueCat() {
  const forcedSubscriptionTier = useMemo(() => resolveForcedSubscriptionTier(), []);
  const forcedTierState = useMemo(
    () => (forcedSubscriptionTier ? tierStateFromTier(forcedSubscriptionTier) : null),
    [forcedSubscriptionTier]
  );

  const [state, setState] = useState<RevenueCatState>({
    ready: Boolean(forcedTierState),
    ...(forcedTierState || tierStateFromTier("free")),
    offerings: null,
    proPackage: null,
    teamPackage: null,
    enterprisePackage: null,
  });
  const [available, setAvailable] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    async function setup() {
      if (forcedTierState) {
        if (mounted) {
          setAvailable(false);
          setState((prev) => ({
            ...prev,
            ready: true,
            ...forcedTierState,
          }));
        }
        return;
      }

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

        const tier = resolveTier(customerInfo);
        const { proPackage, teamPackage, enterprisePackage } = classifyPackages(offerings);

        setState({
          ready: true,
          ...tier,
          offerings,
          proPackage,
          teamPackage,
          enterprisePackage,
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
  }, [forcedTierState]);

  const refresh = useCallback(async () => {
    if (forcedTierState) {
      setState((prev) => ({
        ...prev,
        ready: true,
        ...forcedTierState,
      }));
      return;
    }

    if (!available) {
      return;
    }

    const [customerInfo, offerings] = await Promise.all([Purchases.getCustomerInfo(), Purchases.getOfferings()]);
    const tier = resolveTier(customerInfo);
    const { proPackage, teamPackage, enterprisePackage } = classifyPackages(offerings);

    setState((prev) => ({
      ...prev,
      ...tier,
      offerings,
      proPackage,
      teamPackage,
      enterprisePackage,
    }));
  }, [available, forcedTierState]);

  const purchaseForTier = useCallback(async (tier: Exclude<SubscriptionTier, "free">) => {
    if (forcedTierState) {
      return forcedTierState.isPro;
    }

    const selectedPackage =
      tier === "enterprise"
        ? state.enterprisePackage
        : tier === "team"
          ? state.teamPackage
          : state.proPackage;
    if (!selectedPackage) {
      throw new Error(`No ${tier} package is available.`);
    }

    const result = await Purchases.purchasePackage(selectedPackage);
    const tierState = resolveTier(result.customerInfo);
    setState((prev) => ({ ...prev, ...tierState }));
    return tierState.isPro;
  }, [forcedTierState, state.enterprisePackage, state.proPackage, state.teamPackage]);

  const purchasePro = useCallback(async () => {
    return purchaseForTier("pro");
  }, [purchaseForTier]);

  const purchaseTeam = useCallback(async () => {
    return purchaseForTier("team");
  }, [purchaseForTier]);

  const purchaseEnterprise = useCallback(async () => {
    return purchaseForTier("enterprise");
  }, [purchaseForTier]);

  const restore = useCallback(async () => {
    if (forcedTierState) {
      setState((prev) => ({ ...prev, ready: true, ...forcedTierState }));
      return forcedTierState.isPro;
    }

    const info = await Purchases.restorePurchases();
    const tier = resolveTier(info);
    setState((prev) => ({ ...prev, ...tier }));
    return tier.isPro;
  }, [forcedTierState]);

  const proPriceLabel = useMemo(() => {
    return state.proPackage?.product.priceString || null;
  }, [state.proPackage]);
  const teamPriceLabel = useMemo(() => {
    return state.teamPackage?.product.priceString || null;
  }, [state.teamPackage]);
  const enterprisePriceLabel = useMemo(() => {
    return state.enterprisePackage?.product.priceString || null;
  }, [state.enterprisePackage]);
  const teamSeatCount = useMemo(() => {
    return extractSeatCount(state.teamPackage);
  }, [state.teamPackage]);
  const enterpriseSeatCount = useMemo(() => {
    return extractSeatCount(state.enterprisePackage);
  }, [state.enterprisePackage]);

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
    teamPackage: state.teamPackage,
    enterprisePackage: state.enterprisePackage,
    proPriceLabel,
    teamPriceLabel,
    enterprisePriceLabel,
    teamSeatCount,
    enterpriseSeatCount,
    priceLabel: proPriceLabel,
    refresh,
    purchaseForTier,
    purchasePro,
    purchaseTeam,
    purchaseEnterprise,
    restore,
  };
}

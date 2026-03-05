import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const purchasesMock = vi.hoisted(() => ({
  setLogLevel: vi.fn(),
  configure: vi.fn(async () => undefined),
  getCustomerInfo: vi.fn(async () => ({ entitlements: { active: {} } })),
  getOfferings: vi.fn(async () => ({
    current: {
      monthly: {
        identifier: "monthly",
        product: {
          priceString: "$4.99",
        },
      },
    },
  })),
  purchasePackage: vi.fn(async () => ({ customerInfo: { entitlements: { active: {} } } })),
  restorePurchases: vi.fn(async () => ({ entitlements: { active: {} } })),
}));

vi.mock("react-native-purchases", () => ({
  default: purchasesMock,
  LOG_LEVEL: {
    WARN: "WARN",
  },
}));

import { useRevenueCat } from "./useRevenueCat";

type RevenueCatHandle = {
  available: boolean;
  ready: boolean;
  isPro: boolean;
  isTeam: boolean;
  isEnterprise: boolean;
  subscriptionTier: "free" | "pro" | "team" | "enterprise";
  isPaid: boolean;
  priceLabel: string | null;
  purchasePro: () => Promise<boolean>;
  restore: () => Promise<boolean>;
};

function buildCustomerInfo(activeEntitlements: string[]) {
  return {
    entitlements: {
      active: Object.fromEntries(
        activeEntitlements.map((id) => [
          id,
          {
            identifier: id,
            isActive: true,
          },
        ])
      ),
    },
  };
}

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

async function waitFor(predicate: () => boolean, label: string) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (predicate()) {
      return;
    }
    await flush();
  }
  throw new Error(`Timed out waiting for ${label}`);
}

function latestOrThrow(value: RevenueCatHandle | null): RevenueCatHandle {
  if (!value) {
    throw new Error("Hook did not initialize.");
  }
  return value;
}

beforeEach(() => {
  purchasesMock.setLogLevel.mockClear();
  purchasesMock.configure.mockClear();
  purchasesMock.getCustomerInfo.mockReset();
  purchasesMock.getOfferings.mockReset();
  purchasesMock.purchasePackage.mockReset();
  purchasesMock.restorePurchases.mockReset();

  purchasesMock.getCustomerInfo.mockResolvedValue(buildCustomerInfo([]));
  purchasesMock.getOfferings.mockResolvedValue({
    current: {
      monthly: {
        identifier: "monthly",
        product: {
          priceString: "$4.99",
        },
      },
    },
  });
  purchasesMock.purchasePackage.mockResolvedValue({
    customerInfo: buildCustomerInfo([]),
  });
  purchasesMock.restorePurchases.mockResolvedValue(buildCustomerInfo([]));

  process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS = "rc-ios-test-key";
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_PRO;
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_TEAM;
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ENTERPRISE;

  consoleErrorSpy = vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    const joined = args.map((value) => String(value)).join(" ");
    if (joined.includes("react-test-renderer is deprecated")) {
      return;
    }
    process.stderr.write(`${joined}\n`);
  });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
});

afterEach(() => {
  delete process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS;
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_PRO;
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_TEAM;
  delete process.env.EXPO_PUBLIC_RC_ENTITLEMENT_ENTERPRISE;
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("useRevenueCat", () => {
  it("treats team entitlement as paid and exposes team tier state", async () => {
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(buildCustomerInfo(["team"]));

    let latest: RevenueCatHandle | null = null;
    function Harness() {
      latest = useRevenueCat();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => Boolean(latest && latest.ready), "revenuecat hook ready");

    expect(latestOrThrow(latest).available).toBe(true);
    expect(latestOrThrow(latest).isPaid).toBe(true);
    expect(latestOrThrow(latest).isPro).toBe(true);
    expect(latestOrThrow(latest).isTeam).toBe(true);
    expect(latestOrThrow(latest).isEnterprise).toBe(false);
    expect(latestOrThrow(latest).subscriptionTier).toBe("team");
    expect(latestOrThrow(latest).priceLabel).toBe("$4.99");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("upgrades tier state when purchase returns enterprise entitlement", async () => {
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(buildCustomerInfo([]));
    purchasesMock.purchasePackage.mockResolvedValueOnce({
      customerInfo: buildCustomerInfo(["enterprise"]),
    });

    let latest: RevenueCatHandle | null = null;
    function Harness() {
      latest = useRevenueCat();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => Boolean(latest && latest.ready), "revenuecat hook ready");

    let purchased = false;
    await act(async () => {
      purchased = await latestOrThrow(latest).purchasePro();
    });

    expect(purchased).toBe(true);
    expect(latestOrThrow(latest).subscriptionTier).toBe("enterprise");
    expect(latestOrThrow(latest).isEnterprise).toBe(true);
    expect(latestOrThrow(latest).isTeam).toBe(true);
    expect(latestOrThrow(latest).isPro).toBe(true);
    expect(purchasesMock.purchasePackage).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("updates to pro tier on restore when only pro entitlement is active", async () => {
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(buildCustomerInfo([]));
    purchasesMock.restorePurchases.mockResolvedValueOnce(buildCustomerInfo(["pro"]));

    let latest: RevenueCatHandle | null = null;
    function Harness() {
      latest = useRevenueCat();
      return null;
    }

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(React.createElement(Harness));
    });
    await waitFor(() => Boolean(latest && latest.ready), "revenuecat hook ready");

    let restored = false;
    await act(async () => {
      restored = await latestOrThrow(latest).restore();
    });

    expect(restored).toBe(true);
    expect(latestOrThrow(latest).subscriptionTier).toBe("pro");
    expect(latestOrThrow(latest).isPro).toBe(true);
    expect(latestOrThrow(latest).isTeam).toBe(false);
    expect(latestOrThrow(latest).isEnterprise).toBe(false);
    expect(purchasesMock.restorePurchases).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

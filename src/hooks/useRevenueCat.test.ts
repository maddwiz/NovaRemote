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
  proPriceLabel: string | null;
  teamPriceLabel: string | null;
  enterprisePriceLabel: string | null;
  teamSeatCount: number | null;
  enterpriseSeatCount: number | null;
  purchasePro: () => Promise<boolean>;
  purchaseTeam: () => Promise<boolean>;
  purchaseEnterprise: () => Promise<boolean>;
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

  it("routes team and enterprise purchases through tier-specific packages", async () => {
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(buildCustomerInfo([]));
    purchasesMock.getOfferings.mockResolvedValueOnce({
      current: {
        availablePackages: [
          {
            identifier: "pro_monthly",
            product: { identifier: "novaremote_pro_monthly", title: "NovaRemote Pro", priceString: "$4.99" },
          },
          {
            identifier: "team_monthly",
            product: { identifier: "novaremote_team_monthly", title: "NovaRemote Team", priceString: "$19.99" },
          },
          {
            identifier: "enterprise_monthly",
            product: {
              identifier: "novaremote_enterprise_monthly",
              title: "NovaRemote Enterprise",
              priceString: "$99.99",
            },
          },
        ],
      },
    } as any);
    purchasesMock.purchasePackage
      .mockResolvedValueOnce({ customerInfo: buildCustomerInfo(["team"]) })
      .mockResolvedValueOnce({ customerInfo: buildCustomerInfo(["enterprise"]) });

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

    expect(latestOrThrow(latest).proPriceLabel).toBe("$4.99");
    expect(latestOrThrow(latest).teamPriceLabel).toBe("$19.99");
    expect(latestOrThrow(latest).enterprisePriceLabel).toBe("$99.99");
    expect(latestOrThrow(latest).teamSeatCount).toBeNull();
    expect(latestOrThrow(latest).enterpriseSeatCount).toBeNull();

    await act(async () => {
      await latestOrThrow(latest).purchaseTeam();
    });
    const purchaseCalls = purchasesMock.purchasePackage.mock.calls as unknown as Array<[unknown]>;
    const teamCall = purchaseCalls[0]?.[0] as { identifier?: string };
    expect(teamCall?.identifier).toBe("team_monthly");
    expect(latestOrThrow(latest).subscriptionTier).toBe("team");

    await act(async () => {
      await latestOrThrow(latest).purchaseEnterprise();
    });
    const enterpriseCall = purchaseCalls[1]?.[0] as { identifier?: string };
    expect(enterpriseCall?.identifier).toBe("enterprise_monthly");
    expect(latestOrThrow(latest).subscriptionTier).toBe("enterprise");

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("extracts seat counts from package metadata for team and enterprise plans", async () => {
    purchasesMock.getCustomerInfo.mockResolvedValueOnce(buildCustomerInfo([]));
    purchasesMock.getOfferings.mockResolvedValueOnce({
      current: {
        availablePackages: [
          {
            identifier: "team_5_seats_monthly",
            product: {
              identifier: "novaremote_team_5_seats_monthly",
              title: "NovaRemote Team 5 seats",
              description: "Team subscription for 5 seats",
              priceString: "$19.99",
            },
          },
          {
            identifier: "enterprise_seats_200",
            product: {
              identifier: "novaremote_enterprise_seats_200",
              title: "NovaRemote Enterprise",
              description: "Enterprise tier seats 200",
              priceString: "$99.99",
            },
          },
        ],
      },
    } as any);

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

    expect(latestOrThrow(latest).teamSeatCount).toBe(5);
    expect(latestOrThrow(latest).enterpriseSeatCount).toBe(200);

    await act(async () => {
      renderer?.unmount();
    });
  });
});

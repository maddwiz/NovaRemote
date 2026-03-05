import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PaywallModal } from "./PaywallModal";

let consoleErrorSpy: ReturnType<typeof vi.spyOn> | null = null;

beforeEach(() => {
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
  consoleErrorSpy?.mockRestore();
  consoleErrorSpy = null;
  vi.unstubAllGlobals();
});

describe("PaywallModal", () => {
  it("shows tier upgrade actions for free/pro plans when configured", async () => {
    const onUpgradePro = vi.fn();
    const onUpgradeTeam = vi.fn();
    const onUpgradeEnterprise = vi.fn();

    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <PaywallModal
          visible
          subscriptionTier="free"
          proPriceLabel="$4.99"
          teamPriceLabel="$19.99"
          enterprisePriceLabel="$99.99"
          onClose={() => undefined}
          onUpgradePro={onUpgradePro}
          onUpgradeTeam={onUpgradeTeam}
          onUpgradeEnterprise={onUpgradeEnterprise}
          onRestore={() => undefined}
        />
      );
    });

    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Team" })).not.toThrow();
    expect(() => renderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Enterprise" })).not.toThrow();

    act(() => {
      renderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Pro" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Team" }).props.onPress();
      renderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Enterprise" }).props.onPress();
    });

    expect(onUpgradePro).toHaveBeenCalledTimes(1);
    expect(onUpgradeTeam).toHaveBeenCalledTimes(1);
    expect(onUpgradeEnterprise).toHaveBeenCalledTimes(1);

    await act(async () => {
      renderer?.unmount();
    });
  });

  it("hides upgrade actions that are no longer applicable for current tier", async () => {
    let teamRenderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      teamRenderer = TestRenderer.create(
        <PaywallModal
          visible
          subscriptionTier="team"
          proPriceLabel="$4.99"
          teamPriceLabel="$19.99"
          enterprisePriceLabel="$99.99"
          onClose={() => undefined}
          onUpgradePro={() => undefined}
          onUpgradeTeam={() => undefined}
          onUpgradeEnterprise={() => undefined}
          onRestore={() => undefined}
        />
      );
    });

    expect(() => teamRenderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Team" })).toThrow();
    expect(() => teamRenderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Enterprise" })).not.toThrow();

    await act(async () => {
      teamRenderer?.unmount();
    });

    let enterpriseRenderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      enterpriseRenderer = TestRenderer.create(
        <PaywallModal
          visible
          subscriptionTier="enterprise"
          proPriceLabel="$4.99"
          teamPriceLabel="$19.99"
          enterprisePriceLabel="$99.99"
          onClose={() => undefined}
          onUpgradePro={() => undefined}
          onUpgradeTeam={() => undefined}
          onUpgradeEnterprise={() => undefined}
          onRestore={() => undefined}
        />
      );
    });

    expect(() => enterpriseRenderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Team" })).toThrow();
    expect(() => enterpriseRenderer?.root.findByProps({ accessibilityLabel: "Upgrade to NovaRemote Enterprise" })).toThrow();

    await act(async () => {
      enterpriseRenderer?.unmount();
    });
  });

  it("renders seat-aware plan labels when seat metadata is provided", async () => {
    let renderer: TestRenderer.ReactTestRenderer | null = null;
    await act(async () => {
      renderer = TestRenderer.create(
        <PaywallModal
          visible
          subscriptionTier="team"
          proPriceLabel="$4.99"
          teamPriceLabel="$19.99"
          enterprisePriceLabel="$99.99"
          teamSeatCount={5}
          enterpriseSeatCount={200}
          onClose={() => undefined}
          onUpgradePro={() => undefined}
          onUpgradeTeam={() => undefined}
          onUpgradeEnterprise={() => undefined}
          onRestore={() => undefined}
        />
      );
    });

    expect(() =>
      renderer?.root.findByProps({
        children: "Team: Pro + shared fleet, role access, token broker, audit logging (5 seats).",
      })
    ).not.toThrow();
    expect(() =>
      renderer?.root.findByProps({
        children: "Enterprise: Team + SSO, 200 seats, compliance controls, SLA support.",
      })
    ).not.toThrow();

    await act(async () => {
      renderer?.unmount();
    });
  });
});

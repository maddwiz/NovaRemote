import * as Linking from "expo-linking";
import * as SecureStore from "expo-secure-store";
import { useCallback, useEffect, useState } from "react";

import { STORAGE_REFERRAL_CLAIMED_CODE, STORAGE_REFERRAL_CODE } from "../constants";

function generateReferralCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let index = 0; index < 8; index += 1) {
    const random = Math.floor(Math.random() * alphabet.length);
    result += alphabet[random];
  }
  return result;
}

function normalizeCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
}

export function useReferrals() {
  const [myReferralCode, setMyReferralCode] = useState<string>("");
  const [claimedReferralCode, setClaimedReferralCode] = useState<string>("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      const [savedOwnCode, savedClaimed] = await Promise.all([
        SecureStore.getItemAsync(STORAGE_REFERRAL_CODE),
        SecureStore.getItemAsync(STORAGE_REFERRAL_CLAIMED_CODE),
      ]);

      if (!mounted) {
        return;
      }

      const ownCode = normalizeCode(savedOwnCode || "") || generateReferralCode();
      const claimed = normalizeCode(savedClaimed || "");

      setMyReferralCode(ownCode);
      setClaimedReferralCode(claimed);

      if (!savedOwnCode) {
        await SecureStore.setItemAsync(STORAGE_REFERRAL_CODE, ownCode);
      }
    }

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  const buildReferralLink = useCallback(() => {
    if (!myReferralCode) {
      return "";
    }
    return Linking.createURL("referral", {
      queryParams: {
        code: myReferralCode,
      },
    });
  }, [myReferralCode]);

  const claimReferralCode = useCallback(
    async (rawCode: string) => {
      const code = normalizeCode(rawCode);
      if (!code) {
        throw new Error("Referral code is required.");
      }
      if (!myReferralCode) {
        throw new Error("Referral code system is still initializing. Try again.");
      }
      if (code === myReferralCode) {
        throw new Error("You cannot claim your own referral code.");
      }
      if (claimedReferralCode && claimedReferralCode !== code) {
        throw new Error(`A referral code is already claimed (${claimedReferralCode}).`);
      }

      setClaimedReferralCode(code);
      await SecureStore.setItemAsync(STORAGE_REFERRAL_CLAIMED_CODE, code);
      return code;
    },
    [claimedReferralCode, myReferralCode]
  );

  const extractReferralCodeFromUrl = useCallback((url: string | null): string => {
    if (!url) {
      return "";
    }
    const parsed = Linking.parse(url);
    if (parsed.path !== "referral") {
      return "";
    }
    const raw =
      typeof parsed.queryParams?.code === "string"
        ? parsed.queryParams.code
        : typeof parsed.queryParams?.ref === "string"
          ? parsed.queryParams.ref
          : "";
    return normalizeCode(raw);
  }, []);

  return {
    myReferralCode,
    claimedReferralCode,
    buildReferralLink,
    claimReferralCode,
    extractReferralCodeFromUrl,
  };
}

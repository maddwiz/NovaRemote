# Play Store Prep Checklist

## 1) Package + signing

- Confirm Android package ID in `app.json` (`com.novaai.novaremote`)
- Configure Google Play App Signing in Play Console
- Ensure EAS Android credentials are configured for production

## 2) Compliance + policy

- Privacy policy URL live and accessible
- Data safety form completed:
  - Microphone (voice commands / glasses mode)
  - Camera (QR server setup scanner)
  - Local storage / SecureStore (credentials and app settings)
  - Optional analytics metadata to user-managed companion server
  - Notifications (watch/session alerts)
- Target API level and SDK requirements satisfied by Expo SDK 55 build output

Policy drafts available in repo:

- `docs/PRIVACY_POLICY.md`
- `docs/TERMS_OF_SERVICE.md`

## 3) Store listing assets

- App icon (512x512)
- Feature graphic (1024x500)
- Screenshots:
  - phone portrait (terminal, AI, fleet, glasses mode)
  - tablet screenshot for split-view layouts
- Short description + full description + keywords

## 4) In-app products (if using RevenueCat)

- Create subscription products in Google Play Console
- Mirror products/offering IDs in RevenueCat
- Validate entitlement mapping (`pro`)

## 5) Release validation

- Internal testing track build upload
- End-to-end tests:
  - onboarding
  - server connect
  - session start/send/stop
  - LLM test and provider switching
  - paywall purchase + restore
  - referral + shared templates flows

## 6) Submission commands

- Build: `npm run eas:build:android:prod`
- Submit: `npm run eas:submit:android`

After submit, monitor Play pre-launch report and Android vitals.

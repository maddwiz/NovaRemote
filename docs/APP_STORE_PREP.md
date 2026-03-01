# App Store Prep

## Metadata

- App name: `NovaRemote`
- Bundle ID: `com.novaai.novaremote`
- Version: `1.1.0`
- Build number: `1.1.0`

## Required Policies

Before submission, publish and link:

- Privacy Policy URL
- Terms of Service URL

Drafts are in-repo:

- `docs/PRIVACY_POLICY.md`
- `docs/TERMS_OF_SERVICE.md`

GitHub Pages deploy assets are in:

- `docs/public/privacy-policy.html`
- `docs/public/terms-of-service.html`
- workflow: `.github/workflows/legal-pages.yml`

Recommended public URLs once Pages is enabled:

- `https://maddwiz.github.io/NovaRemote/privacy-policy.html`
- `https://maddwiz.github.io/NovaRemote/terms-of-service.html`

## RevenueCat / IAP Setup

1. Create products in App Store Connect.
2. Configure an offering in RevenueCat with entitlement id `pro`.
3. Configure EAS environment variables:
   - `eas env:create --name EXPO_PUBLIC_REVENUECAT_API_KEY_IOS --value <key> --environment production`
   - `eas env:create --name EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID --value <key> --environment production`
4. Set env vars in local builds (optional):
   - `EXPO_PUBLIC_REVENUECAT_API_KEY_IOS`
   - `EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID`
5. Verify purchase and restore flows on sandbox accounts.

## Notifications

- Confirm `expo-notifications` permission flow on device.
- Configure push credentials/certificates if moving beyond local notification scaffolding.

## Assets

- App icon and splash assets verified for iPhone + iPad
- Screenshot sets:
  - iPhone 15 Pro
  - iPhone 15 Pro Max
  - iPad Pro

### Screenshot Storyboard (Recommended)

1. Multi-server terminal dashboard with live statuses
2. AI suggestion + error triage inside a shell session
3. Fleet command run with grouped results
4. File browser + terminal path insertion
5. Glasses mode HUD/voice controls
6. iPad split-view terminals + controls

Store source captures in `docs/media/` before exporting App Store crops.

### Demo Video Clips (for launch marketing)

- Clip 1 (20-40s): live terminal streaming + ANSI + search
- Clip 2 (20-40s): AI suggestion + fleet execute + watch alerts
- Publish one primary share link for Product Hunt/X/Reddit posts

Draft store listing text:

- `docs/APP_STORE_DESCRIPTION.md`

## Final QA

- Validate onboarding flow
- Validate biometric lock behavior
- Validate free-tier gating and paywall transitions
- Validate deep-link import: `novaremote://add-server?...`
- Validate no personal/local credentials in defaults or screenshots
- Validate a production TestFlight build on physical iPhone/iPad:
  - `eas build --platform ios --profile production`
- Validate review notes are ready:
  - “NovaRemote connects to a user-managed companion server. For review use: [test server URL + token].”
  - Template: `docs/APP_STORE_REVIEW_NOTES.md`

# Privacy Policy

Last updated: March 1, 2026

## Overview

NovaRemote is a mobile client for connecting to a user-managed companion server. NovaRemote does not require account creation and does not run a mandatory cloud backend for terminal traffic.

## Data We Process

NovaRemote can process the following categories of data on-device:

- Server profile metadata (name, URL, optional defaults)
- Authentication tokens for companion servers
- Terminal/session UI state (drafts, tags, history, preferences)
- Optional LLM provider profiles (including API keys)
- Optional app settings (biometric lock, theme, onboarding/tutorial status)
- Optional analytics preference and anonymous analytics identifier
- Optional referral code metadata

## Where Data Is Stored

- Sensitive profile data is stored locally using platform secure storage via Expo SecureStore.
- Other app state may be kept in local app storage.
- NovaRemote does not automatically upload your commands or terminal output to a NovaRemote-operated cloud.

## Network Requests

NovaRemote sends requests to:

- Your configured companion server(s) for terminal, file, AI, and related features.
- Optional external LLM providers you configure.
- Optional RevenueCat endpoints for purchase/entitlement flows.
- Optional analytics endpoint (`/analytics/event`) on your companion server when analytics is enabled.

Analytics events are designed to be anonymous metadata and should not include command/output content.

## Microphone and Notifications

- Microphone access is requested only for voice/glasses mode features.
- Notification permission is requested only for alert/notification features.

## Sharing

- Server share links and QR templates intentionally exclude bearer tokens.
- Exported LLM profiles are encrypted with a user-provided passphrase.

## Your Choices

You can:

- Delete or edit server/LLM profiles in-app.
- Disable optional analytics.
- Disable biometric lock.
- Remove the app to delete local data from the device.

## Security Notes

No client application can guarantee perfect security. Keep companion server tokens private, use HTTPS where possible, and rotate credentials if you suspect exposure.

## Contact

For privacy questions, provide a support contact before store submission (email or website support form) and replace this placeholder section.

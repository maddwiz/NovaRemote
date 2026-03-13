# NovaRemote Runbook

Updated: 2026-03-13

## Local Quality Check
```bash
cd '/Users/desmondpottle/Documents/New project/NovaRemote'
npm run ci
npm run release:verify
```

## iOS Simulator
```bash
cd '/Users/desmondpottle/Documents/New project/NovaRemote'
node ./scripts/ensure-ios-info-plist.mjs
npm run fix:ios:path-spaces
npm run ios:run -- -d 'iPhone 16e'
```

## Physical iPhone Validation
1. Connect device by USB
2. Confirm trust, unlock, and Developer Mode enabled
3. Verify device visibility:
```bash
xcrun xcdevice list 2>/dev/null | sed -n '1,240p'
xcrun devicectl device info details --device 'Dez iphone'
```
4. If repo-path `xcodebuild` stalls, use the temp-path workaround documented in `FINAL_HANDOFF.md`

## Cloud / VR Bootstrap Verification
```bash
npm run cloud:verify-bootstrap
npm run vr:verify-bootstrap
npm run contracts:verify-sync
```

## Key Logs
- App/device logging: `xcrun simctl spawn booted log show ...` for simulator, device logs via Xcode/Console for physical phone
- Build logs: `xcodebuild` stdout/stderr and `/usr/bin/log show --predicate 'process == "xcodebuild"'`

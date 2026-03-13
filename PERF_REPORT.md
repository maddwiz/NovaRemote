# NovaRemote Performance Report

Updated: 2026-03-13

## Current Verification
- `npm run ci` passed on 2026-03-13
- Test count: 73 files, 490 tests passed
- Contract/cloud/VR bootstrap verifications passed
- Expo doctor passed (`17/17` checks)

## Performance-Relevant Design Choices
- Connection pool keeps per-server websocket state isolated
- Fleet execution reuses pooled capability/base-path decisions
- Unread state is derived incrementally instead of forcing destructive reconnects
- NovaAdapt bridge prefers capability-aware server routing and reduces repeated unsupported-route probing

## Known Performance Caveats
- Physical iPhone install and on-device runtime validation still need to be finished in the current branch
- Simulator voice behavior is not a reliable proxy for real-device speech playback performance
- Production VR/native and cloud/backend performance are external to this repo

## Recommendation
- Treat repo-side performance validation as green for code/test/bootstrap scope
- Complete device-level runtime validation before calling the mobile app fully release-ready

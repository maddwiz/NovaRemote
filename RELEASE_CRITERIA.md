# NovaRemote Release Criteria

Updated: 2026-03-13

## Repo-Side Gates
- `npm run ci` passes
- No unresolved typecheck failures
- No unresolved unit/integration test failures
- Contract sync verification passes
- Cloud bootstrap verification passes
- VR bootstrap verification passes
- Expo doctor passes

## Mobile App Gates
- Fresh iOS device install succeeds
- Core paths verified on physical device:
  - onboarding/setup
  - multi-server connect/switch
  - terminal session creation/send/stop
  - files read/edit/save
  - Nova assistant basic chat and command routing
- Voice paths verified on device before treating Nova voice as release-ready

## Companion / Agent Gates
- Companion `/agents/*` bridge reachable against target runtime
- Sidecar contract validation passes against pinned NovaAdapt baseline
- Runtime-miss and fallback behaviors remain explicit and correct

## Enterprise / Team Gates
- Team login, token broker, audit sync, export requests, and policy enforcement verified against target cloud environment
- Viewer/operator/admin permission boundaries verified end to end

## Not Required For Mobile App Release
- Shipping the production VR repo from this codebase
- Shipping the production enterprise backend from this codebase

## Current Status
- Repo-side gates: passing
- Physical-device validation: still required
- Production external tracks: still external/in-progress

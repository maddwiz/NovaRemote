# NovaRemote File Map

Updated: 2026-03-13

## Root
- `README.md`: top-level product and local-run overview
- `FINAL_HANDOFF.md`: current continuation handoff
- `PRODUCT_SPEC.md`, `ARCHITECTURE.md`, `FILEMAP.md`, `RELEASE_CRITERIA.md`, `RUNBOOK.md`, `DEPLOY.md`, `ROLLBACK.md`, `SECURITY_REVIEW.md`, `PERF_REPORT.md`, `CHANGELOG.md`: release/hardening docs

## Source
- `src/AppShell.tsx`: central app orchestration and navigation shell
- `src/screens/`: route-level screens (`Terminals`, `Servers`, `Files`, `Agents`, `Team`, `VR`, `Glasses`, `Settings`, etc.)
- `src/components/`: reusable UI surfaces, rails, overlays, cards, modals
- `src/hooks/`: stateful app logic for servers, terminals, voice, Nova, auth, tokens, audit, safety, files
- `src/vr/`: VR preview/runtime coordination

## Docs
- `docs/HANDOFF_STATUS.md`: feature completion state across roadmap phases
- `docs/ROADMAP.md`: milestone-level roadmap summary
- `docs/NOVAADAPT_SERVER_ROLLOUT.md`: companion-side NovaAdapt migration notes
- `docs/cloud/`: cloud repo bootstrap docs
- `docs/vr/`: VR repo bootstrap/contract docs
- `docs/contracts/`: protocol/OpenAPI source-of-truth artifacts

## Scripts
- `scripts/verify-contract-sync.sh`: verifies protocol sync into temp targets
- `scripts/bootstrap-cloud-stack.sh`, `scripts/verify-cloud-bootstrap.sh`: cloud scaffold/bootstrap verification
- `scripts/bootstrap-vr-repo.sh`, `scripts/verify-vr-bootstrap.sh`: VR scaffold/bootstrap verification
- `scripts/ensure-ios-info-plist.mjs`, `scripts/fix-ios-space-paths.mjs`: iOS build environment helpers

## Native / Expo
- `ios/`: iOS native workspace generated for Expo native builds
- `app.json`, `eas.json`: Expo/EAS configuration

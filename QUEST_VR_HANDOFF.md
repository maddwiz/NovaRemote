# Quest VR Launch-Grade Handoff

Updated: 2026-03-15
Repo: `/Users/desmondpottle/Documents/New project/NovaRemote`
Isolated worktree: `/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR`
Branch: `codex/quest-vr-launch-grade`
Base branch at fork point: `feat/final-polish-and-remaining-work`

## Goal
Build the Quest VR track all the way from the current scaffold/protocol state to launch-grade readiness **without interfering with the phone-app launch branch**.

This branch exists to isolate that work. Treat the phone launch path as protected. VR work should happen here and, where appropriate, in the separate `NovaRemoteVR` repo that this repo already bootstraps.

## The Most Important Architectural Truth
The phone app repo is **not** supposed to become the production Quest client.

This repo already owns:
- VR protocol contracts
- VR bootstrap scripts
- VR preview/control-center surfaces in the phone app
- contract sync and verification hooks

The production immersive client is intended to live in a separate repo:
- `NovaRemoteVR`

That means the next Codex should use this branch to:
1. keep NovaRemote's VR contract/source-of-truth correct
2. bootstrap and drive the separate Quest client repo
3. close the remaining gaps until Quest is launch-grade

## What Already Exists
### In NovaRemote
- VR command center preview screen
- pooled multi-server VR preview/runtime surface
- shared voice/panel route handling with glasses/VR overlap
- VR protocol contract docs and JSON schema
- VR repo bootstrap and contract sync scripts
- CI/bootstrap verification for the VR repo scaffold

### Already documented here
- [VR bootstrap plan](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_REPO_BOOTSTRAP.md)
- [VR protocol contract](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_PROTOCOL_CONTRACT.md)
- [Architecture](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/ARCHITECTURE.md)
- [Roadmap](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/ROADMAP.md)
- [Handoff status](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/HANDOFF_STATUS.md)

### Current `NovaRemoteVR` state
- committed Quest Unity/OpenXR client foundation
- synced contract verification against NovaRemote source-of-truth artifacts
- local Unity edit-mode tests runnable from `npm run quest:test:editmode`
- repeatable Quest smoke APK builds via `npm run build:quest:smoke`
- operator tooling for candidate manifests, candidate bundling, runtime config generation/push, install, and logcat capture
- conditional GitHub Actions coverage for Unity edit-mode and Quest smoke builds once Unity secrets are configured
- updated Quest setup, QA, release, rollback, and known-issues docs in the external repo

### Bootstrap support already present
- [bootstrap-vr-repo.sh](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/scripts/bootstrap-vr-repo.sh)
- [sync-vr-contracts.sh](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/scripts/sync-vr-contracts.sh)
- [verify-vr-bootstrap.sh](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/scripts/verify-vr-bootstrap.sh)
- [verify-contract-sync.sh](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/scripts/verify-contract-sync.sh)

## What Is Not Done
- physical Quest install/run validation of the current candidate
- real Quest auth/session bootstrap validation on device
- full in-headset terminal rendering, send/control routing, and reconnect validation
- controller/hand interaction validation and polish on real hardware
- Quest voice routing validation on real hardware
- signing/release packaging automation for tester distribution
- broader CI validation and release hardening beyond the current conditional Unity workflow coverage
- launch-grade QA and release checklist pass on real Quest hardware

## Success Definition
Quest is considered launch-grade only when all of these are true:
1. A real Quest client can sign in, discover capabilities, and connect to the companion server.
2. Users can open, focus, resize, move, and close terminal panels in VR.
3. Session stream updates are low-latency and reconnect safely after network interruptions.
4. Users can send text, control keys, and route commands to the correct `serverId + session`.
5. Basic voice route commands work reliably in-headset.
6. Concurrent phone + Quest usage works against the same companion/runtime.
7. Auth/token handling is secure and reviewed.
8. The Quest app has onboarding, error handling, and enough polish for external testers.
9. A release checklist exists and is actually passable.

## Recommended Execution Plan
Phases 0 through much of 3 now exist in repo form. The remaining emphasis is physical-headset validation, release hardening, and packaging.

### Phase 0: Establish the external Quest repo cleanly
- Bootstrap `/Users/desmondpottle/Documents/New project/NovaRemoteVR` from this repo if it does not already exist.
- Keep this NovaRemote branch as the contract/source-of-truth branch.
- Create a dedicated Quest branch inside `NovaRemoteVR`.
- Verify contract sync from NovaRemote to NovaRemoteVR before coding client logic.

### Phase 1: Quest MVP shell
- Unity + OpenXR app shell
- protocol client wiring
- secure token storage/bootstrap
- server capability discovery
- basic panel scene boot

### Phase 2: Real terminal usefulness
- open/list sessions
- create session
- send text
- send ctrl keys
- stream snapshot/delta handling
- reconnect behavior

### Phase 3: Spatial usability
- layout presets: `arc`, `grid`, `cockpit`
- focus switching
- panel move/resize
- workspace persistence
- session labels and state surfaces

### Phase 4: Voice and collaboration essentials
- Quest voice route command handling
- channel/presence status if needed for beta
- parity with the contract where it matters for panel routing

### Phase 5: Launch-grade hardening
- reconnect stress tests
- concurrent phone + Quest validation
- crash/exception capture path
- auth/token review
- performance pass
- tester onboarding and release notes

## Non-Goals
Do **not** do these on this branch unless absolutely required:
- large new phone-app UI overhauls unrelated to Quest support
- launch-branch polish work
- rewriting existing companion protocol without a clear contract need
- mixing Vision Pro completion into the Quest-first track before Quest is solid

## Strong Working Rules For The Next Codex
1. Keep the phone launch path isolated. This branch exists so VR work does not disturb launch.
2. Do Quest first. Vision Pro stays second.
3. Prefer finishing real vertical slices over scattering scaffold changes everywhere.
4. Treat NovaRemote as the protocol source of truth and NovaRemoteVR as the actual immersive client.
5. Keep contract changes explicit and versioned.
6. When a task belongs in `NovaRemoteVR`, do it there instead of forcing it into the phone repo.

## Suggested First Commands
```bash
git -C '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR' status --short --branch
sed -n '1,220p' '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_REPO_BOOTSTRAP.md'
sed -n '1,220p' '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_PROTOCOL_CONTRACT.md'
```

If the external VR repo is missing:
```bash
cd '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR' && npm run vr:bootstrap-repo -- '/Users/desmondpottle/Documents/New project/NovaRemoteVR'
cd '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR' && npm run vr:sync-contracts -- '/Users/desmondpottle/Documents/New project/NovaRemoteVR'
cd '/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR' && npm run vr:verify-bootstrap
```

## Files The Next Codex Should Read First
- [VR bootstrap plan](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_REPO_BOOTSTRAP.md)
- [VR protocol contract](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/vr/VR_PROTOCOL_CONTRACT.md)
- [VrCommandCenterScreen.tsx](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/src/screens/VrCommandCenterScreen.tsx)
- [ARCHITECTURE.md](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/ARCHITECTURE.md)
- [HANDOFF_STATUS.md](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/docs/HANDOFF_STATUS.md)
- [FINAL_SUMMARY.json](/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR/FINAL_SUMMARY.json)

## Launch-Grade Deliverables Expected
By the end of the Quest branch, there should be:
- a working `NovaRemoteVR` Quest client repo
- verified contract sync with NovaRemote
- a Quest QA checklist
- a Quest release checklist
- a concise operator/tester setup guide
- explicit known-issues and rollback notes
- a final launch recommendation: `ship`, `private beta`, or `not ready`

## Copy-Paste Prompt For The Next Codex
Open `/Users/desmondpottle/Documents/New project/NovaRemote-QuestVR`.
Work only on branch `codex/quest-vr-launch-grade` unless you intentionally create a subordinate VR branch inside the external `NovaRemoteVR` repo.
This branch is isolated so Quest VR can be built without interfering with the phone-app launch.
Read `QUEST_VR_HANDOFF.md` first, then `docs/vr/VR_REPO_BOOTSTRAP.md` and `docs/vr/VR_PROTOCOL_CONTRACT.md`.
Use NovaRemote as the VR contract/source-of-truth repo, and build the production Quest client in the separate `NovaRemoteVR` repo.
Goal: take Quest from scaffold/protocol-prep to launch-grade completion.
Quest first, Vision Pro second. Do not spend cycles on unrelated phone UI polish.
Leave `/Users/desmondpottle/Documents/New project/NovaRemote/docs/APP_STORE_REVIEW_NOTES.md` and `.playwright-cli/` untouched.

## Notes About Git / Isolation
- This worktree is separate from the current launch worktree.
- The original launch branch remains: `feat/final-polish-and-remaining-work`.
- Any VR changes committed here stay isolated unless deliberately merged later.

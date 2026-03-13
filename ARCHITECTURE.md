# NovaRemote Architecture

Updated: 2026-03-13

## Topology
1. NovaRemote mobile app
2. Companion server per managed machine
3. Optional NovaRemote Cloud control plane
4. Optional VR repo/runtime
5. Optional NovaAdapt + NovaSpine sidecars behind companion `/agents/*`

## App Layers
- UI screens/components in `src/screens` and `src/components`
- Core app shell/orchestration in `src/AppShell.tsx`
- Connection pool + session state in `src/hooks/useConnectionPool.ts`
- Team/auth/audit/governance hooks in `src/hooks/useTeamAuth.ts`, `src/hooks/useTokenBroker.ts`, `src/hooks/useAuditLog.ts`
- Nova/NovaAdapt behavior in `src/hooks/useNova*`, `src/components/Nova*`, and bridge/runtime panels
- AR/VR preview logic in `src/screens/GlassesModeScreen.tsx`, `src/screens/VrCommandCenterScreen.tsx`, and `src/vr/*`

## Runtime Boundaries
- Terminal traffic stays app <-> companion directly
- Cloud traffic covers team identity, server assignment, token brokering, audit/export metadata
- VR production client is external; this repo ships the protocol/bootstrap/preview side only
- NovaAdapt sidecar migration is companion-facing; this repo ships bridge surfaces and contract validation hooks

## Key Contracts
- Client protocol contract: `docs/contracts/novaremote-client-protocol.v1.json`
- Cloud API contract: `docs/contracts/novaremote-cloud-openapi.v1.yaml`
- VR protocol/bootstrap docs: `docs/vr/VR_PROTOCOL_CONTRACT.md`, `docs/vr/VR_REPO_BOOTSTRAP.md`

## Health And Verification
- `npm run ci` verifies typecheck, tests, contract sync, cloud bootstrap, VR bootstrap, and Expo doctor
- Cloud and VR external tracks are validated here through scaffold/contract/bootstrap scripts, not by shipping those repos from this codebase

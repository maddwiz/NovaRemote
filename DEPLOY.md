# NovaRemote Deploy

Updated: 2026-03-13

## Mobile App
- Preview iOS build: `npm run eas:build:ios:preview`
- Production iOS build: `npm run eas:build:ios:prod`
- iOS submit: `npm run eas:submit:ios`
- Android preview/prod builds and submit commands are in `package.json`

## Cloud Scaffold
- Bootstrap: `npm run cloud:bootstrap-repos`
- Verify bootstrap: `npm run cloud:verify-bootstrap`
- Sync contracts: `npm run cloud:sync-contracts`
- Production deployment of those external repos is outside this repo, but templates exist in the generated scaffold

## VR Scaffold
- Bootstrap: `npm run vr:bootstrap-repo`
- Verify bootstrap: `npm run vr:verify-bootstrap`
- Sync contracts: `npm run vr:sync-contracts`
- Production VR deployment is outside this repo

## Companion
- Linux installer helper: `npm run companion:install:linux`
- Windows installer helper: `npm run companion:install:windows`
- Sidecar runtime rollout details live in `docs/NOVAADAPT_SERVER_ROLLOUT.md`

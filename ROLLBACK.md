# NovaRemote Rollback

Updated: 2026-03-13

## App Branch Rollback
- Use git history on the working branch and revert specific commits rather than force-resetting shared history
- Push branch updates through `./.novaforge/bin/safe_git_push.sh`

## Mobile Release Rollback
- Use App Store / Play track rollback controls rather than attempting in-app forced shutdown logic
- Keep previous tested EAS artifacts available for re-release

## Companion / NovaAdapt Rollback
- Follow `docs/NOVAADAPT_SERVER_ROLLOUT.md`
- Use the pinned compatibility baseline in `codex_remote/compat/novaadapt_baseline.json`
- Revert to the last contract-validated sidecar baseline if protocol drift appears

## Cloud / VR Rollback
- Because those are scaffolded external repos, rollback belongs in those repos’ deployment history once bootstrapped
- Keep OpenAPI/client protocol contracts pinned when rolling back generated repos

# NovaRemote Security Review

Updated: 2026-03-13

## Completed Security Controls In Repo
- Secure storage for server profiles and provider credentials
- Biometric app lock support
- Dangerous-command confirmation flow
- Team-managed policy overrides
- Least-privilege token broker model for team-managed servers
- Audit logging and export workflows
- Viewer/operator/admin permission boundaries in team flows
- Team server governance and edit/delete restrictions
- Blocklist enforcement and fleet approval gates

## Architecture Positives
- Terminal traffic stays direct to companion servers instead of routing through the cloud control plane
- Team cloud path is metadata/control-plane oriented rather than terminal-transport oriented
- NovaAdapt bridge capability checks reduce dead-route execution and make fallback explicit

## Open Risks
- Physical-device validation still needed for newer Nova voice behavior
- Production cloud/backend hardening remains external and in progress
- Production companion open-source hardening remains in progress
- Voice and AI surfaces remain high-risk areas for accidental UX confusion unless explicitly validated against policy boundaries

## Recommendation
- Treat the repo as app-side complete but deployment-side conditional until device validation and external service hardening are complete

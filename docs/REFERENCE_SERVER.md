# Reference Companion Server (Codex Remote)

NovaRemote is designed around a companion server API (`docs/SERVER_SETUP.md`).  
To improve adoption, keep a public reference server implementation that matches this spec.

## Recommended Open-Source Setup

1. Publish the companion server as its own repository (for example `codex_remote`).
2. Include:
   - `.env.example` with token, bind, and feature flags
   - `Dockerfile`
   - `docker-compose.yml`
   - health/capabilities endpoint examples
3. Version the API and changelog so app/client compatibility is clear.

## Docker-First Quick Start (Template)

Use this as a baseline in the server repo:

```yaml
# docker-compose.yml (reference template)
services:
  codex-remote:
    build: .
    ports:
      - "8787:8787"
    environment:
      - NOVA_TOKEN=change-me
      - NOVA_BIND=0.0.0.0
      - NOVA_PORT=8787
    restart: unless-stopped
```

```dockerfile
# Dockerfile (reference template)
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 8787
CMD ["npm", "run", "start"]
```

## Compatibility Contract

When updating the server, keep these endpoints stable:

- Terminal sessions and streaming (`/terminal/*` and/or `/tmux/*`)
- AI session lifecycle (`/codex/start`, `/codex/message`)
- Shell execution (`/shell/run`)
- Optional files/process/voice endpoints when enabled

Always keep `/health` and capability metadata accurate so NovaRemote can detect features safely.

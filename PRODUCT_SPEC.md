# NovaRemote Product Spec

Updated: 2026-03-13

## Summary
NovaRemote is a mobile-first remote operations client for terminals, AI-assisted coding, files, fleet execution, AR/VR workspace control, and team-governed access. It connects to companion servers and cloud-side governance services instead of storing raw SSH credentials in the app.

## Primary Users
- Solo developers managing laptops, workstations, homelab nodes, and cloud VMs
- DevOps/SRE operators who need mobile terminal and fleet controls
- Team admins who need governed access, auditability, and server assignment
- Future AR/VR power users working from glasses and immersive control surfaces

## Core Product Goals
- Persistent multi-server operation with instant switching
- Safe remote command execution with policy and approval controls
- Strong mobile ergonomics for terminal + AI + files
- In-app agent orchestration through NovaAdapt/NovaSpine integration
- Team-ready governance without routing terminal traffic through the cloud control plane

## Implemented Scope In This Repo
- Pooled multi-server connections and unread/status-aware switcher rail
- Concurrent session streaming, session stop routing, file browsing/editing, fleet execution
- External LLM provider integration and local/session AI routing
- Glasses and VR preview surfaces with pooled panel/workspace controls
- NovaAdapt in-app orchestration and companion `/agents/*` bridge UI/runtime integration
- Team auth, token broker, audit log, server governance, policy enforcement, export workflows
- Cloud and VR repo bootstrap/sync/verify scaffolding

## Deferred / External Scope
- Production NovaRemoteVR native client repo implementation
- Production NovaRemote Cloud backend and admin dashboard rollout/hardening
- Companion-server release hardening and open-source packaging of the NovaAdapt sidecar topology
- Final physical-device validation of newer Nova voice behavior

## Non-Goals
- Direct app-managed SSH credential storage
- Terminal traffic proxying through the cloud control plane
- Shipping the production VR app from this repository
- Shipping the production enterprise backend from this repository

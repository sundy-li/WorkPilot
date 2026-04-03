# WorkPilot

Agent-native collaboration workspace for channels, private conversations, runtime daemon injection, agent creation, and task handoff.

## Apps

- `apps/web`: React + Vite IM workbench
- `apps/control-plane`: Bun + Hono control-plane API
- `apps/agent-daemon`: Bun daemon for runtime registration and heartbeat
- `packages/shared`: shared domain logic and API contracts
- `packages/ui`: shared UI primitives

## Quick Start

```bash
bun install
bun run dev:control-plane
bun run dev:web
```

Environment files:

- `.env.example`: committed template
- `.env.local`: local development defaults for your machine

Current local Postgres config is set to:

```bash
DATABASE_URL=postgres://sundy:sundy@127.0.0.1:5432/sundy
```

Equivalent manual check:

```bash
PGPASSWORD=sundy psql -h 127.0.0.1 -U sundy -d sundy
```

Open `http://localhost:3000` and sign in with:

- email: `admin@workpilot.local`
- password: `demo-password`

Generate a runtime install command in the web UI, or run a daemon directly:

```bash
bun run --cwd apps/agent-daemon start -- --control-plane-url http://localhost:3001 --registration-token <token>
```

## Verification

```bash
bun test
bun run typecheck
bun run --cwd apps/web build
```

## Current State

- Shared domain model, API contracts, and tests are implemented
- Runtime daemons and agents are now separate entities: runtimes heartbeat and host multiple agents
- Control-plane can boot against Postgres automatically when `DATABASE_URL` is available
- In-memory storage is still retained for fast tests and fallback execution
- PostgreSQL schema is defined in `apps/control-plane/db/schema.sql`
- WebSocket transport and full task ingress/event APIs are still pending

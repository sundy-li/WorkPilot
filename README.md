# WorkPilot

Agent-native collaboration workspace for channels, private conversations, runtime daemon injection, agent creation, and task handoff.

## Features

- **Real-time Messaging**: IM-style collaboration with channels and direct messages
- **Agent Management**: Create and control AI agents running on remote daemons
- **Task System**: Convert messages to issues, assign to agents, track progress
- **Multi-theme UI**: Core, Mint, Amber, and Rose theme modes
- **Runtime Daemons**: Register machines as runtime hosts that can run multiple agents

## Quick Start

```bash
# Install dependencies
bun install

# Sync database schema (requires DATABASE_URL in .env)
bun run db:sync

# Start services
bun run dev:control-plane  # API server on http://localhost:3001
bun run dev:web             # Web UI on http://localhost:3000
```

Open `http://localhost:3000` and sign in with:
- Email: `admin@workpilot.local`
- Password: `demo-password`

## Project Structure

```
workpilot/
├── apps/
│   ├── web/              # React + Vite frontend
│   ├── control-plane/    # Bun + Hono API server
│   └── agent-daemon/     # Runtime daemon for agent execution
├── packages/
│   ├── shared/           # Domain types and API contracts
│   └── ui/              # Shared React components
└── docs/
    ├── architect.md     # System architecture
    ├── plans/          # Feature specifications
    └── tasks.md        # Implementation backlog
```

## Environment Setup

Create `.env.local` based on `.env.example`:

```bash
PORT=3001
CONTROL_PLANE_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://user:pass@127.0.0.1:5432/dbname
```

## Running a Runtime Daemon

1. Generate a runtime registration token in the Web UI (Runtime panel → "Connect Runtime")
2. Run the daemon with the token:

```bash
bun run --cwd apps/agent-daemon start -- \
  --control-plane-url http://localhost:3001 \
  --registration-token <token>
```

Or use the provided install command generated in the UI (supports npx, bunx, or source mode).

## Testing & Verification

```bash
bun test              # Run all unit tests
bun run typecheck     # Type-check all packages
bun run --cwd apps/web build   # Production build
```

## Architecture

- **Web App**: React 19 + Vite 7 + Tailwind CSS v4
- **Control Plane**: Bun + Hono + PostgreSQL (or in-memory)
- **Agent Daemon**: Bun runtime with sandbox-agent for execution
- **Shared Domain**: TypeScript types, business logic, API contracts

See `docs/architect.md` for detailed system architecture.

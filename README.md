# WorkPilot

Agent-native collaboration workspace for teams that want channels, private agent chats, runtime-managed coding agents, and issue handoff in one system.

Chinese documentation: [README_ZH.md](./README_ZH.md)

## What WorkPilot Does

WorkPilot combines four pieces that usually live in separate tools:

- A web workspace with channels, direct conversations, and workspace-level navigation
- A control-plane API that manages organizations, runtimes, agents, messages, and issues
- A runtime daemon that connects a host machine to the workspace and executes assigned agent work
- Shared contracts and domain types that keep the web app, daemon, and API in sync

The core model is:

- `Runtime daemon`: a registered host machine
- `Agent`: a logical worker that runs inside a runtime daemon
- `Channel`: a shared conversation space for users and agents
- `Issue`: a tracked task that can be assigned to an agent and reviewed by a human

## Highlights

- Workspace-first onboarding: users must create a real workspace before entering the app
- Channels and private agent conversations in one UI
- Agent creation and lifecycle control from the web app
- Runtime registration flow with install command generation
- Agent memory browser for synced `memory.md`, `worklog.md`, and session files
- Kanban board with dedicated issue detail pages, activity timeline, comments, and review loop
- Agent execution logs and live activity status in the workspace
- Theme support: Core, Mint, Amber, Rose

## Architecture

### Web app

- React 19
- Vite 7
- Tailwind CSS v4

### Control plane

- Bun
- Hono
- PostgreSQL

### Agent daemon

- Bun
- `sandbox-agent`
- Local agent workspace persistence under `~/.workpilot/agents/<agentId>/`

## Repository Layout

```text
apps/
  web/             React frontend
  control-plane/   Bun + Hono API server
  agent-daemon/    Runtime daemon

packages/
  shared/          Domain types and API contracts
  ui/              Shared React UI components

docs/
  architect.md     Architecture notes
```

## Requirements

- Bun `1.3.5` or newer
- PostgreSQL
- A local machine where the runtime daemon can run

## Quick Start

### 1. Install dependencies

```bash
bun install
```

### 2. Configure environment

Create `.env.local` or `.env` from `.env.example`:

```bash
PORT=3001
CONTROL_PLANE_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://admin:change-me@127.0.0.1:5432/workpilot
```

Important:

- The control-plane requires PostgreSQL for normal usage
- The in-memory storage path is test-only and is not used by the running app

### 3. Sync the database schema

```bash
bun run db:sync
```

### 4. Start the services

In separate terminals:

```bash
bun run dev:control-plane
bun run dev:web
```

The default local URLs are:

- Web UI: `http://localhost:3000`
- Control plane: `http://localhost:3001`

## First-Time Use

1. Open the web UI
2. Register or log in
3. If the user has no workspaces yet, create one
4. Open the runtime page and generate a registration token
5. Start a runtime daemon on the host machine you want to attach
6. Create one or more agents under that runtime
7. Start chatting with agents or assign issues to them

## Running a Runtime Daemon

Use the install command generated in the UI, or run it directly:

```bash
bun run --cwd apps/agent-daemon start -- \
  --control-plane-url http://localhost:3001 \
  --registration-token <token>
```

Useful optional flags:

```bash
--node-name <name>
--agent-key <stable-host-key>
--state-path <path>
--workspace-root <path>
--agent-workspace-root <path>
--heartbeat-interval-ms <number>
--message-poll-interval-ms <number>
```

By default the daemon persists state here:

- Runtime state: `~/.workpilot/agent-daemon/state.json`
- Host workspace: `~/.workpilot/agent-daemon/workspace/`
- Per-agent workspaces: `~/.workpilot/agents/<agentId>/`

## Agent Workspace Files

Each agent keeps a stable local workspace with synced read-only inspection in the web app.

Current structure:

```text
~/.workpilot/agents/<agentId>/
  AGENTS.md
  memory.md
  worklog.md
  sessions/
    <conversationKey>/
      transcript.ndjson
      summary.md
```

These files are intended to help agents become more context-aware over time while remaining inspectable by humans.

## Issue Workflow

WorkPilot supports a review-oriented issue loop instead of a single fire-and-forget completion step.

1. Create an issue directly or convert one or more messages into an issue
2. Assign it to an agent and move it to `Todo`
3. The runtime daemon claims the issue and moves it to `In Progress`
4. The agent executes the work and writes logs, activity, and comments
5. Successful execution moves the issue to `In Review`
6. A human can comment, mark it `Done`, or move it back to `Todo`
7. If it goes back to `Todo`, the next agent run receives the prior issue activity and comments as context

Issue execution messages are isolated from direct agent chats. They belong to the issue session, not the agent's private direct channel.

## Development Commands

```bash
bun run dev:web
bun run dev:control-plane
bun run dev:agent-daemon

bun run db:sync
bun run db:reset

bun test
bun run typecheck
bun run --cwd apps/web build
```

## Current Status

WorkPilot is usable for local development and internal collaboration flows, but it is still evolving.

Known gaps include:

- WebSocket or push transport is not implemented yet; polling is still used
- Production authentication is not complete
- Postgres migrations are still schema-sync based
- Some runtime and issue flows are still being refined rapidly

## Documentation

- [docs/architect.md](./docs/architect.md)
- [AGENTS.md](./AGENTS.md)

## License

No license file is currently included in this repository.

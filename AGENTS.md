# AGENTS.md

## Project Overview

WorkPilot is a Bun-based monorepo for an Agent-native collaboration workspace. The codebase distinguishes between **runtime daemons** and **agents**:

- **Runtime Daemon**: An injected host process registered into an organization. Each runtime can host multiple agents.
- **Agent**: A logical worker created inside a runtime daemon with name, description, implementation, model, and reasoning effort.

The project provides:
- A React web client for login and IM-style collaboration
- A Bun + Hono control-plane API
- A Bun Agent daemon runtime with polling-based control and task execution
- Shared domain logic, contracts, and UI primitives

## Monorepo Layout

```
apps/
├── web/              # React + Vite frontend
│   └── src/
│       ├── app.tsx           # Main application
│       └── lib/              # State management & utilities
├── control-plane/    # Bun + Hono API server
│   └── src/
│       ├── app.ts            # API routes
│       ├── index.ts          # Entry point
│       ├── storage/          # Storage implementations
│       └── db/schema.sql     # PostgreSQL schema
└── agent-daemon/     # Runtime daemon
    └── src/
        ├── index.ts          # CLI entry
        ├── runtime.ts        # Runtime core
        ├── agent-host.ts     # Agent session management
        └── client.ts         # Control-plane client

packages/
├── shared/           # Domain types & contracts
│   └── src/
│       ├── domain/workspace.ts
│       └── contracts.ts
└── ui/              # Shared React components
    └── src/components/
```

## Architecture

### Web App (`apps/web`)

**Stack**: React 19 + Vite 7 + Tailwind CSS v4

**Entry Points**:
- `apps/web/src/app.tsx` - Main React application
- `apps/web/src/lib/api.ts` - Control-plane API client

**Features**:
- Email/password login
- Channel rail (group + direct messages)
- Message stream with attachments
- Agent rail showing registered agents
- Issue/task board with Kanban
- Runtime daemon connection panel
- Agent creation and lifecycle control
- Theme switching (core, mint, amber, rose)

**State Management**:
- `shell-state.ts` - Primary navigation, workspace selection
- `workspace-browser.ts` - Agent/runtime browser
- `message-selection.ts` - Multi-select for message-to-issue conversion
- `theme-mode.ts` - Theme persistence

### Control Plane (`apps/control-plane`)

**Stack**: Bun + Hono + PostgreSQL

**API Routes**:

| Category | Routes |
|----------|--------|
| Auth | `/auth/register`, `/auth/login`, `/auth/magic-link/*` |
| Organizations | `GET /organizations/:orgId`, `GET /organizations/:orgId/channels` |
| Runtimes | `POST /runtime/register`, `POST /runtime/heartbeat`, `DELETE /runtimes/:runtimeId` |
| Agents | `POST /runtimes/:runtimeId/agents`, `POST /agents/:agentId/control` |
| Messages | `GET/POST /channels/:channelId/messages`, `POST /messages/:messageId/issues` |
| Issues | `POST /issues`, `PATCH /issues/:issueId`, `POST /runtime/issues/pull` |
| Events | `POST /agent/issue-events`, `POST /agent/message-events` |

**Storage**:
- PostgreSQL when `DATABASE_URL` is present
- In-memory for tests and development fallback

### Agent Daemon (`apps/agent-daemon`)

**Stack**: Bun + sandbox-agent

**Responsibilities**:
1. Runtime registration and identity persistence
2. Heartbeat loop (reports health to control-plane)
3. Agent synchronization from workspace bootstrap
4. Control action polling and local application
5. Task/issue polling and execution
6. Event writeback (issue status updates, agent messages)

**Agent Host** (`agent-host.ts`):
- Installs `sandbox-agent` packages
- Manages agent sessions
- Enforces lifecycle (start/stop/restart/delete)
- Executes prompts and captures responses

### Shared Package (`packages/shared`)

**Domain Types**:
```typescript
type RuntimeDaemonStatus = "pending" | "online" | "offline" | "unhealthy" | "revoked" | "deleted";
type AgentLifecycleState = "running" | "stopped" | "deleted";
type AgentImplementation = "claude" | "codex" | "opencode" | "pi";
type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";
```

### UI Package (`packages/ui`)

- `Button` - primary, secondary, ghost variants
- `Input` - form input
- `Card` - card layout components
- `Badge` - status badges

## Development Commands

```bash
# Install
bun install

# Database
bun run db:sync         # Sync schema.sql to PostgreSQL

# Development
bun run dev:web             # http://localhost:3000
bun run dev:control-plane   # http://localhost:3001
bun run dev:agent-daemon    # Requires --registration-token

# Verification
bun test
bun run typecheck
bun run --cwd apps/web build
```

## Testing Strategy

| Package | Test File | Coverage |
|---------|-----------|----------|
| shared | `workspace.test.ts` | Domain logic, permissions, state transitions |
| control-plane | `app.test.ts` | API routes, CORS, storage |
| control-plane | `postgres.test.ts` | Postgres persistence |
| agent-daemon | `client.test.ts` | API client flows |
| agent-daemon | `runtime.test.ts` | Runtime lifecycle, agent sync |
| agent-daemon | `agent-host.test.ts` | Package installation, sessions |
| web | `api.test.ts` | Bootstrap loading, lifecycle control |

## Data Flows

### Runtime Registration
1. User generates token in Web UI
2. Daemon calls `POST /runtime/register` with token
3. Control-plane validates token, creates runtime
4. Daemon persists runtime identity locally

### Agent Creation
1. User creates agent via `POST /runtimes/:runtimeId/agents`
2. Control-plane creates agent profile + channel
3. Daemon syncs agent on next bootstrap poll

### Task Execution
1. User promotes message to issue
2. Daemon polls assigned issues via `POST /runtime/issues/pull`
3. Daemon executes via sandbox-agent
4. Daemon writes status update via `POST /agent/issue-events`
5. Optional: Daemon posts response to channel

## Working Conventions

- **Runtime**: Bun
- **Language**: TypeScript
- **Frontend Style**: Tailwind CSS v4, use `@workpilot/ui` components
- **API Contracts**: Use `@workpilot/shared` types
- **Testing**: Add failing test first, then implement
- **Persistence**: Control-plane uses Postgres when available; daemon identity survives restart

## Current Gaps

- Full Postgres repository coverage
- Migrations workflow
- WebSocket/push transport
- Channel participant management
- Production-grade auth (demo-only)
- Full agent output capture (returns generic receipt)
- Rich task retry/backoff controls

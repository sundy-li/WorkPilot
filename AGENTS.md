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
- Empty-workspace onboarding that requires creating a workspace before entering the main app
- Channel rail (group + direct messages)
- Channel header tools for editing channel metadata and browsing current members
- Message stream with attachments
- Composer `@mention` suggestions for channel agents and members
- Agent rail showing registered agents
- Issue/task board with Kanban
- Dedicated issue workspace page with editable properties and activity timeline
- Runtime daemon connection panel
- Agent creation and lifecycle control (`start`, `stop`, `reset session`, `reset memory`, `delete`)
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
| Workspaces | `GET /workspaces`, `POST /workspaces`, `GET /organizations/:orgId`, `GET /organizations/:orgId/channels` |
| Channels | `POST /organizations/:orgId/channels`, `PATCH /channels/:channelId`, `GET /channels/:channelId/participants` |
| Runtimes | `POST /runtime/register`, `POST /runtime/heartbeat`, `DELETE /runtimes/:runtimeId` |
| Agents | `POST /runtimes/:runtimeId/agents`, `POST /agents/:agentId/control` |
| Messages | `GET/POST /channels/:channelId/messages`, `POST /messages/:messageId/issues` |
| Issues | `POST /issues`, `PATCH /issues/:issueId`, `DELETE /issues/:issueId`, `GET /issues/:issueId/activities`, `POST /issues/:issueId/comments`, `POST /runtime/issues/pull` |
| Events | `POST /agent/issue-events`, `POST /agent/message-events` |

**Storage**:
- PostgreSQL in the running control-plane
- In-memory storage remains test-only

### Agent Daemon (`apps/agent-daemon`)

**Stack**: Bun + sandbox-agent

**Responsibilities**:
1. Runtime registration and identity persistence
2. Heartbeat loop (reports health to control-plane)
3. Agent synchronization from workspace bootstrap
4. Control action polling and local application
5. Task/issue polling and execution
6. Event writeback (issue status updates, agent messages)
7. Issue activity persistence for create/edit/status/agent execution events

**Agent Host** (`agent-host.ts`):
- Installs `sandbox-agent` packages
- Manages agent sessions
- Enforces lifecycle (start/stop/reset session/reset memory/delete)
- `reset session` clears cached sandbox sessions plus persisted per-conversation summaries/transcripts, while keeping long-term memory and worklog intact
- `reset memory` recreates the agent workspace from scratch so stale local files do not survive the reset
- Executes prompts and captures responses
- Persists per-agent local workspace files under `~/.workpilot/agents/<agentId>/`
- Maintains `memory.md`, `worklog.md`, and per-conversation `sessions/<conversationKey>/transcript.ndjson` plus `summary.md`
- Syncs read-only workspace file snapshots back to the control-plane for UI inspection

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
3. Claiming a `todo` issue automatically moves it to `in_progress` and records issue activity
4. Daemon executes via sandbox-agent
5. On success the agent moves the issue to `in_review`, not directly to `done`
6. Human review comments are stored on the issue timeline; moving back to `todo` sends that feedback back in the next agent prompt
7. Daemon writes status/comment updates via `POST /agent/issue-events`
8. Optional: Daemon posts response to channel

## Working Conventions

- **Runtime**: Bun
- **Language**: TypeScript
- **Frontend Style**: Tailwind CSS v4, use `@workpilot/ui` components
- **API Contracts**: Use `@workpilot/shared` types
- **Testing**: Add failing test first, then implement
- **Persistence**: Control-plane uses Postgres when available; daemon identity survives restart

## Agent Constraints

When modifying code, you **MUST** follow these rules:

### 1. Documentation Updates
If you change architecture, add new features, or modify APIs:
- Update `AGENTS.md` to reflect the new behavior
- Update `docs/architect.md` with any architectural changes

### 2. Code Minimalism
- **Always delete dead code** - unused functions, commented-out logic, obsolete imports
- **Remove unused files** - if a file is no longer imported, delete it
- **Simplify designs** - if a feature can be done in fewer files/lines, refactor it
- **No over-engineering** - don't add abstraction layers unless there's clear duplication

### 3. Review Checklist
Before submitting any changes:
- [ ] Check if AGENTS.md or architect.md needs updating
- [ ] Run `bun run typecheck` to ensure no type errors
- [ ] Run `bun test` to ensure tests pass
- [ ] Verify no unused imports or dead code was introduced
- [ ] Ensure the change is minimal and focused

### 4. Architecture Principles
- Keep the codebase **lean** - less code means less bugs
- **YAGNI** - don't implement features "for future use"
- **Single responsibility** - each file/module has one clear purpose
- **Explicit over implicit** - clear naming and documentation

### 5. UI/UX Design Guidelines

When the task involves designing app interfaces, interaction flows, prototypes, visual layouts, micro-interactions, or overall user experience, strictly follow these principles:

- **Apply Polanyi’s Tacit Knowledge (Tacit Knowing)**: Simulate the intuitive, embodied, and often inarticulable knowledge of an experienced human designer. As Michael Polanyi stated, “we can know more than we can tell.” Prioritize the overall “feels right” sensation, natural flow, and living quality of the experience rather than relying solely on explicit rules or current design trends.

- Focus on the **from-to structure** of tacit knowing: Use subsidiary awareness (subtle details, spatial relationships, rhythms, micro-animations, and haptic feedback) to support focal awareness (the user’s main goal and emotional experience).

- Emphasize **user body memory and implicit expectations**: Interactions should feel instinctive — users should “just know” how to operate without thinking, like riding a bicycle. Avoid overly instructional or hand-holding experiences.

- In color, typography, motion, whitespace, and hierarchy, pursue **emergent harmony and intuitive beauty** instead of mechanically applying Material Design, iOS HIG, or popular trends.

- First evaluate the design from the perspective of “what a senior human designer would intuitively feel comfortable with,” then validate it against explicit usability principles (e.g., Nielsen’s heuristics).

- When users provide reference screenshots or competing apps, internalize their tacit essence (tone, rhythm, emotional feel) rather than copying them pixel-for-pixel.

#### Specific Design Preferences (Workspace Style)

- Prefer a **single workspace surface** over stacking multiple bordered cards inside the same page.
- Use **layout, spacing, dividers, and subtle background shifts** before adding more boards, shadows, or nested borders.
- Important working areas should be **full-height**

## Current Gaps

- Full Postgres repository coverage
- Migrations workflow
- WebSocket/push transport
- Channel participant management
- Production-grade auth (demo-only)
- Full agent output capture (returns generic receipt)
- Rich task retry/backoff controls

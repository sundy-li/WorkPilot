# WorkPilot Architecture

## Overview

WorkPilot is an Agent-native collaboration workspace built as a Bun-based monorepo. It combines real-time messaging (IM-style collaboration) with autonomous agent execution, enabling seamless handoff between human operators and AI agents.

### Core Concepts

- **Runtime Daemon**: An injected host process registered into an organization. Each runtime can host multiple agents.
- **Agent**: A logical worker created within a runtime daemon, configured with name, description, implementation, model, and reasoning effort.
- **Channel**: Group or direct messaging channels where humans and agents collaborate.
- **Issue**: Task items that can be created from messages or directly, assigned to agents for execution.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              Web Client (React)                         │
│                         http://localhost:3000                          │
└─────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        Control Plane (Bun + Hono)                       │
│                         http://localhost:3001                          │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │   Auth      │  │  Workspace  │  │   Agent     │  │    Issues   │   │
│  │  Routes     │  │   Routes    │  │   Routes    │  │   Routes    │   │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘   │
│          │                │                │                │          │
│          └────────────────┴────────────────┴────────────────┘          │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │                    Storage Layer                                 │    │
│  │  ┌─────────────────────┐  ┌──────────────────────────────┐      │    │
│  │  │  In-Memory Storage │  │    Postgres Storage          │      │    │
│  │  │  (Tests Only)      │  │    (Runtime)                 │      │    │
│  │  └─────────────────────┘  └──────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
          │                                              ▲
          │                                              │
          ▼                                              │
┌─────────────────────────────────────────────────────────────────────────┐
│                    Agent Daemon (Bun Runtime)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
│  │  Registration│  │  Heartbeat  │  │   Agent     │  │   Task      │  │
│  │   Client    │  │   Client    │  │   Host      │  │  Executor   │  │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘  │
│          │                │                │                │          │
│          └────────────────┴────────────────┴────────────────┘          │
│                              │                                          │
│                              ▼                                          │
│  ┌─────────────────────────────────────────────────────────────────┐    │
│  │              Sandbox Agent (agent-os package)                  │    │
│  │  - Package installation                                        │    │
│  │  - Session management                                          │    │
│  │  - Prompt execution                                            │    │
│  └─────────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Component Details

### 1. Web Application (`apps/web`)

A React-based IM workbench built with:
- **React 19** + **Vite 7**
- **Tailwind CSS v4** for styling
- Shared UI components from `@workpilot/ui`

**Key Features:**
- Login/logout functionality
- Channel rail with group and direct messages
- Channel-side context tools for editing metadata and inspecting current members
- Composer `@mention` suggestions scoped to channel agents and members
- Message stream with real-time-like updates
- Agent rail showing all registered agents
- Agent workspace browser for inspecting synced `memory.md`, `worklog.md`, and session files
- Issue/task rail with Kanban-style display plus a dedicated issue workspace page for editing and activity review
- Runtime daemon connection panel
- Agent creation and lifecycle control
- Theme switching (core, mint, amber, rose)

**Entry Points:**
- `apps/web/src/app.tsx` - Main application component
- `apps/web/src/lib/api.ts` - API client for control-plane communication

**State Management:**
- `shell-state.ts` - Primary navigation and workspace state
- `workspace-browser.ts` - Agent/runtime browser state
- `message-selection.ts` - Multi-select for message-to-issue conversion
- `theme-mode.ts` - Theme persistence and switching

### 2. Control Plane (`apps/control-plane`)

A Bun + Hono HTTP API server providing:

**Authentication Routes:**
- `POST /auth/register` - User registration
- `POST /auth/login` - Email/password login
- `GET /workspaces?userId=...` - List workspaces visible to a user
- `POST /workspaces` - Create a workspace and default `all` channel
- `POST /auth/magic-link/send` - Magic link email dispatch
- `POST /auth/magic-link/verify` - Magic link verification

**Workspace Entry Behavior:**
- After login, the web app loads the user's real workspace list from the control-plane
- If the list is empty, the UI blocks the main app and requires creating a first workspace

**Organization & Channel Routes:**
- `GET /organizations/:orgId` - Get organization details
- `GET /organizations/:orgId/channels` - List channels
- `POST /organizations/:orgId/channels` - Create channel
- `PATCH /channels/:channelId` - Update channel name/description
- `GET /channels/:channelId/participants` - List channel members and agent participants

**Runtime Daemon Routes:**
- `POST /organizations/:orgId/runtime-registration-tokens` - Generate install command
- `POST /runtime/register` - Register new runtime
- `POST /runtime/heartbeat` - Runtime heartbeat
- `DELETE /runtimes/:runtimeId` - Delete runtime

**Agent Routes:**
- `POST /runtimes/:runtimeId/agents` - Create agent
- `POST /agents/:agentId/control` - Agent lifecycle control (start/stop/restart/delete)
- `GET /agents/:agentId/workspace-files` - List synced agent workspace files
- `GET /agents/:agentId/workspace-files/content?path=...` - Read one synced agent workspace file
- `GET /runtimes/:runtimeId/control-actions` - Poll control actions
- `POST /control-actions/:actionId/ack` - Acknowledge control action
- `POST /agents/:agentId/direct-channel` - Create direct message channel

**Messaging Routes:**
- `GET /channels/:channelId/messages` - Get messages
- `POST /channels/:channelId/messages` - Create message
- `POST /messages/:messageId/issues` - Promote message to issue
- `POST /issues/from-messages` - Create issue from multiple messages

**Issue Routes:**
- `POST /issues` - Create issue
- `PATCH /issues/:issueId` - Update issue fields and status
- `DELETE /issues/:issueId` - Delete issue
- `GET /issues/:issueId/activities` - Read issue activity timeline
- `POST /issues/:issueId/comments` - Append a human or agent comment to the issue timeline
- `POST /runtime/issues/pull` - Runtime pulls assigned issues
- `POST /agent/issue-events` - Agent updates issue status and emits issue activity entries

**Agent Event Routes:**
- `POST /runtime/messages/pull` - Runtime pulls messages for agent processing
- `POST /agent/message-events` - Agent writes response back to channel
- `POST /agent/workspace-files` - Runtime syncs a read-only snapshot of local agent workspace files

**Entry Points:**
- `apps/control-plane/src/index.ts` - Server entry point
- `apps/control-plane/src/app.ts` - Hono app factory
- `apps/control-plane/db/schema.sql` - PostgreSQL schema

### 3. Agent Daemon (`apps/agent-daemon`)

A Bun-based runtime daemon that:

**Responsibilities:**
- Runtime registration and identity persistence
- Heartbeat loop to report health
- Agent synchronization from control-plane
- Control action polling and application
- Task polling and execution
- Event writeback to control-plane

**Agent Host (`agent-host.ts`):**
- Manages `sandbox-agent` package installation
- Creates and manages agent sessions
- Enforces agent lifecycle (start/stop/restart/delete)
- Handles prompt execution and response capture
- Persists a stable local agent workspace under `~/.workpilot/agents/<agentId>/`
- Maintains `memory.md`, `worklog.md`, and per-conversation `sessions/<conversationKey>/transcript.ndjson` plus `summary.md`
- Syncs those files back to the control-plane so the web app can inspect them without direct filesystem access

**Runtime Core (`runtime.ts`):**
- Polling loops for heartbeats, control actions, and tasks
- State persistence across restarts
- Agent sync and lifecycle coordination

**Entry Points:**
- `apps/agent-daemon/src/index.ts` - CLI entry point
- `apps/agent-daemon/src/runtime.ts` - Runtime core
- `apps/agent-daemon/src/agent-host.ts` - Agent host management
- `apps/agent-daemon/src/client.ts` - Control-plane API client

### 4. Shared Package (`packages/shared`)

Domain types, business logic, and API contracts:

**Domain Types (`domain/workspace.ts`):**
- Organization, Runtime, Agent, Channel, Message, Issue
- Agent lifecycle states and control actions
- Issue status and priority enums

**Contracts (`contracts.ts`):**
- DTO types for all API endpoints
- Client function signatures for control-plane communication

**Key Types:**
```typescript
type RuntimeDaemonStatus = "pending" | "online" | "offline" | "unhealthy" | "revoked" | "deleted";
type AgentLifecycleState = "running" | "stopped" | "deleted";
type AgentImplementation = "claude" | "codex" | "opencode" | "pi";
type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";
```

### 5. UI Package (`packages/ui`)

Shared React UI components:
- `Button` - Primary, secondary, ghost variants
- `Input` - Form input with validation
- `Card` - Card layout components
- `Badge` - Status badges and pills

---

## Database Schema

### Core Tables

| Table | Description |
|-------|-------------|
| `organizations` | Workspace organizations |
| `users` | User accounts |
| `memberships` | User-organization roles |
| `channels` | Group/direct messaging channels |
| `channel_participants` | Channel member tracking |
| `runtime_daemons` | Registered runtime daemons |
| `agents` | Agent profiles |
| `agent_control_actions` | Queued lifecycle actions |
| `runtime_registration_tokens` | Installation tokens |
| `messages` | Channel messages |
| `agent_message_claims` | Agent message processing claims |
| `issues` | Task items |
| `audit_logs` | Action audit trail |

---

## Data Flow

### 1. Runtime Registration

```
1. User generates token via Web UI
   POST /organizations/:orgId/runtime-registration-tokens
   
2. Daemon registers with token
   POST /runtime/register
   - Validates token
   - Creates runtime record
   - Returns credential token
   
3. Daemon persists identity locally
   - Runtime ID
   - Credential token
   - Control-plane URL
```

### 2. Agent Lifecycle

```
1. User creates agent via Web UI
   POST /runtimes/:runtimeId/agents
   
2. Control-plane creates agent profile
   - Assigns channel for direct messages
   
3. Daemon polls and syncs agent
   GET /bootstrap/workspace
   - Gets agents owned by runtime
   
4. User controls agent
   POST /agents/:agentId/control
   - Action: start | stop | restart | delete
   
5. Daemon polls control actions
   GET /runtimes/:runtimeId/control-actions
   - Applies action locally
   - Updates agent status
   
6. Daemon acknowledges action
   POST /control-actions/:actionId/ack
```

### 3. Task Execution

```
1. User creates issue from message
   POST /messages/:messageId/issues
   
2. Daemon polls assigned issues
   POST /runtime/issues/pull
   - Assigned `todo` issues are claimed from the runtime queue and moved to `in_progress`
   
3. Daemon executes task
   - Loads agent implementation
   - Runs prompt through sandbox
   - Captures response
   
4. Daemon writes event back
   POST /agent/issue-events
   - Updates issue status
   - Persists issue activity for status changes and agent updates

5. Review loop
   - Successful agent execution moves the issue to `in_review`
   - Humans can comment on the issue timeline and either mark it `done` or move it back to `todo`
   - When it returns to `todo`, the next runtime claim includes prior comments/activity in the agent prompt

6. Optional: Agent writes message
   POST /agent/message-events
   - Posts response to channel
```

---

## Theme System

The web application supports multiple themes:

### Theme Modes

| Mode | Primary Color | Use Case |
|------|---------------|----------|
| `core` | Indigo (#4f46e5) | Default |
| `mint` | Teal (#0f766e) | Fresh/calm |
| `amber` | Orange (#b45309) | Warm/accent |
| `rose` | Pink (#be185d) | Creative |

### CSS Variables

All themes use CSS custom properties:
- `--bg-main`, `--panel`, `--panel-muted`
- `--border`, `--border-strong`
- `--text-primary`, `--text-secondary`
- `--accent`, `--accent-strong`, `--accent-soft`
- `--success`, `--warning`, `--danger`

---

## Development Commands

### Setup

```bash
bun install              # Install all dependencies
bun run db:sync          # Sync schema to PostgreSQL
```

### Development

```bash
bun run dev:control-plane   # Start control-plane on :3001
bun run dev:web             # Start web app on :3000
bun run dev:agent-daemon    # Start daemon (requires token)
```

### Testing & Build

```bash
bun test              # Run all tests
bun run typecheck     # Type-check all packages
bun run --cwd apps/web build   # Build web app
```

---

## Security Notes

- Authentication is **demo-only** - not production-safe
- Credentials stored in plain text locally
- No encryption at rest
- Magic link flow is stubbed

---

## Future Improvements

See `docs/tasks.md` for the complete backlog:

- WebSocket transport for real-time updates
- Full Postgres migrations workflow
- Channel participant management
- Rich task mutation APIs
- Production-grade permissions
- Full agent output capture
- Task retry/backoff controls

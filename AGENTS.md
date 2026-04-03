# AGENTS.md

## Project Overview

WorkPilot is a Bun-based monorepo for an Agent-native collaboration workspace. The current codebase distinguishes between `runtime daemons` and `agents`:

- a runtime daemon is the injected host process registered into an organization
- an agent is a logical worker created inside a runtime daemon with `name` and `description` prompt constraints

The current codebase provides:

- a React web client for login and IM-style collaboration
- a Bun + Hono control-plane API
- a Bun Agent daemon runtime with polling-based control and task execution
- shared domain logic, contracts, and UI primitives

The repo is still early-stage, but the core runtime loop is now real: runtime registration, heartbeats, per-agent lifecycle control, assigned-task polling, and `agent-os` package-backed execution are implemented. Postgres is available for the control-plane, while realtime transport, richer task mutation, and full execution-output plumbing are still pending.

## Monorepo Layout

- `apps/web`
  Frontend IM workbench built with React, Vite, Tailwind CSS v4, and shared UI components.
- `apps/control-plane`
  Bun + Hono HTTP API for auth, workspace bootstrap, runtime registration, runtime heartbeat, agent creation, agent lifecycle control, messaging, task creation, task polling, and task event writeback.
- `apps/agent-daemon`
  Bun daemon entrypoint and polling runtime that registers the machine, syncs agents, installs `agent-os` packages, applies control actions, and executes assigned tasks.
- `packages/shared`
  Domain types, state transitions, DTO contracts, and unit tests.
- `packages/ui`
  Shared UI primitives used by the web app.
- `packages/config`
  Reserved package for shared tooling config. Currently a placeholder.
- `docs/INIT.md`
  Product and architecture initialization document.
- `docs/tasks.md`
  Project task checklist and implementation backlog.

## Current Architecture

### Web App

Primary entrypoints:

- `apps/web/src/app.tsx`
- `apps/web/src/lib/api.ts`

Current behavior:

- login against `POST /auth/login`
- load seeded workspace data from `GET /bootstrap/workspace`
- render channel rail, message stream, agent rail, and task rail
- create messages with `POST /channels/:channelId/messages`
- promote a selected message into a task with `POST /messages/:messageId/tasks`
- generate a runtime install command with `POST /organizations/:orgId/runtime-registration-tokens`
- create agents on a runtime daemon with `POST /runtimes/:runtimeId/agents`
- control agent lifecycle from chat with `POST /agents/:agentId/control`
- refresh workspace state after lifecycle changes so agent status reflects daemon-applied state

The frontend currently assumes the control-plane is available at `http://localhost:3001`.

### Control Plane

Primary entrypoints:

- `apps/control-plane/src/app.ts`
- `apps/control-plane/src/index.ts`
- `apps/control-plane/db/schema.sql`

Current behavior:

- demo auth routes exist for register, login, magic-link send, and verify
- CORS is enabled for local web development
- seeded in-memory workspace is still the default for tests and local API-only runs
- workspace bootstrap returns organization, channels, runtimes, agents, messages, and tasks
- runtime registration tokens can be created by `owner` and `admin`
- runtime daemons can register and send heartbeats
- each runtime can host multiple agents with `name`, `description`, `implementation`, `model`, `reasoningEffort`, and `status`
- agent lifecycle requests are queued per runtime via control actions
- assigned agent tasks can be claimed by a runtime through polling
- agent task events can update task status and write agent-authored messages back into the channel
- messages can be created and promoted into tasks

Important constraint:

- the SQL schema is now wired into a Postgres-backed storage path used by `apps/control-plane/src/index.ts` when `DATABASE_URL` is present
- in-memory storage still exists as the default path for unit and API tests

### Agent Daemon

Primary entrypoints:

- `apps/agent-daemon/src/index.ts`
- `apps/agent-daemon/src/client.ts`

Current behavior:

- parse CLI args or env vars for control-plane URL and registration token
- register the runtime through `/runtime/register`
- persist daemon runtime identity locally so restart reuses the same runtime registration
- start a heartbeat loop through `/runtime/heartbeat`
- poll workspace bootstrap to sync agents owned by the current runtime
- install implementation-specific `agent-os` packages for synced agents
- poll runtime control actions and apply `start`, `stop`, `restart`, and `delete` locally
- poll assigned tasks, dispatch them through `runAgentPrompt()`, and post task events back to the control-plane

The daemon now behaves like a real runtime host, but task completion still posts a generic execution receipt rather than the model's full natural-language output.

### Shared Domain

Primary entrypoints:

- `packages/shared/src/domain/workspace.ts`
- `packages/shared/src/contracts.ts`

Current domain coverage:

- organization snapshot
- runtime registration token issuance
- runtime registration
- runtime heartbeat handling
- per-runtime agent creation
- agent lifecycle state and queued control actions
- offline reconciliation helper
- message creation
- message-to-task promotion
- runtime task claim helpers and agent task-event recording
- DTO types for auth, channels, runtimes, agents, messages, tasks, runtime registration, control actions, and task claims

## Development Commands

Install dependencies:

```bash
bun install
```

Run apps:

```bash
bun run dev:control-plane
bun run dev:web
bun run dev:agent-daemon
```

Verification:

```bash
bun test
bun run typecheck
bun run --cwd apps/web build
```

## Testing Strategy

Current automated coverage:

- `packages/shared/src/domain/workspace.test.ts`
  Domain behavior for registration permissions, heartbeat expiry, agent lifecycle/control actions, task claiming, task-event writeback, and message-to-task conversion.
- `apps/control-plane/src/app.test.ts`
  API behavior for CORS, login, runtime registration, runtime heartbeat, per-runtime agent creation, agent lifecycle control, task polling, task-event writeback, and task creation.
- `apps/control-plane/src/storage/postgres.test.ts`
  Postgres persistence for runtime registration, agent creation, control actions, and claimed task flows.
- `apps/agent-daemon/src/client.test.ts`
  Runtime daemon registration, heartbeat, control-action polling, task polling, and task-event client flows.
- `apps/agent-daemon/src/runtime.test.ts`
  Runtime lifecycle, agent sync, control-action application, and task dispatch through `runAgentPrompt()`.
- `apps/agent-daemon/src/agent-host.test.ts`
  `agent-os` package installation, session creation, stopped-agent enforcement, and local agent deletion behavior.
- `apps/web/src/lib/api.test.ts`
  Frontend API client bootstrap loading and agent lifecycle control.

When extending behavior:

- add or update a failing test first
- keep business rules in `packages/shared` when possible
- keep transport-specific code in app packages

## Working Conventions

- Runtime and package management: Bun
- Language: TypeScript
- Frontend style: use shared UI components from `packages/ui` first
- API contracts: prefer shared types from `@workpilot/shared`
- State of persistence: control-plane persistence depends on storage backend; daemon runtime identity does survive restart through its local state file
- State of auth: demo-only implementation, not production-safe

## Immediate Gaps

These are intentionally not finished yet:

- full Postgres repository coverage for every route and workflow
- migrations workflow
- WebSocket or push-based transport
- channel participant management
- `PATCH /tasks/:taskId`
- real magic-link flow and session storage
- full `sandbox-agent` output capture so agent replies can be written back as actual model text instead of a generic completion receipt
- richer daemon execution controls and observability around task retries, backoff, and failure inspection
- production-grade permissions, audit querying, and observability

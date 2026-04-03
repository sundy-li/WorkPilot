# WorkPilot Tasks

This file tracks implementation progress for the current repository. Use checkboxes to mark completed work.

## 0. Foundation

- [x] Create Bun monorepo structure with `apps/*` and `packages/*`
- [x] Add shared TypeScript base config and workspace path aliases
- [x] Add root verification commands for tests, typecheck, and web build
- [x] Create initial project docs in `docs/INIT.md`
- [x] Create project README with quick start and verification commands

## 1. Shared Domain And Contracts

- [x] Define shared domain model for organizations, runtime daemons, agents, messages, tasks, and audit logs
- [x] Add runtime registration token issuance logic with role enforcement
- [x] Add runtime daemon registration logic with one-time token usage
- [x] Add runtime heartbeat recording logic
- [x] Add per-runtime agent creation with `name` and `description`
- [x] Add message-to-task promotion logic
- [x] Add shared DTO contracts for auth, channels, messages, tasks, and Agent payloads
- [ ] Add channel participant domain model and validation
- [ ] Add task assignment history model
- [ ] Add audit log query model and filters
- [ ] Add richer organization and membership models beyond the current seed state

## 2. Control Plane API

- [x] Implement local-dev CORS support
- [x] Implement demo auth endpoints
- [x] Implement workspace bootstrap endpoint
- [x] Implement runtime registration token endpoint
- [x] Implement runtime register endpoint
- [x] Implement runtime heartbeat endpoint
- [x] Implement create agent-on-runtime endpoint
- [x] Implement create message endpoint
- [x] Implement create task from message endpoint
- [ ] Implement `GET /channels/:channelId/messages` pagination and filters
- [ ] Implement `POST /organizations/:orgId/channels`
- [ ] Implement `PATCH /tasks/:taskId`
- [ ] Implement `POST /agent/task-events`
- [ ] Implement membership and participant management endpoints
- [ ] Replace seeded in-memory state with repository-backed services
- [ ] Split route handlers, services, and repositories into separate modules

## 3. Database And Persistence

- [x] Draft initial PostgreSQL schema in `apps/control-plane/db/schema.sql`
- [ ] Choose migration tool and add migrations workflow
- [x] Add database connection management for Bun runtime
- [ ] Implement repositories for organizations, users, memberships, channels, messages, tasks, runtime daemons, and agents
- [x] Load bootstrap data from Postgres instead of in-memory seed
- [x] Persist runtime registration token lifecycle
- [x] Persist runtime heartbeat and status transitions
- [x] Persist agent definitions created under each runtime daemon
- [ ] Persist audit logs for auth, registration, messaging, and task events
- [ ] Add seed data scripts for local development

## 4. Authentication And Sessions

- [x] Add demo email/password login flow
- [x] Add placeholder magic-link endpoints
- [ ] Add password hashing and credential storage
- [ ] Add session persistence or JWT issuance
- [ ] Add logout endpoint and client session reset flow
- [ ] Add real magic-link token creation, delivery, and verification
- [ ] Add route protection on control-plane endpoints
- [ ] Add role-aware authorization middleware

## 5. Web IM Workbench

- [x] Build login screen
- [x] Build IM-style three-column workspace layout
- [x] Render seeded channels, runtime daemons, agents, and tasks
- [x] Send message from the web client
- [x] Promote a selected message into a task
- [x] Generate a runtime install command in the UI
- [x] Add a minimal create-agent flow with `name` and `description`
- [ ] Add loading and error states per panel instead of global-only handling
- [ ] Add message timestamps and ordering controls
- [ ] Add task details drawer and task status update controls
- [ ] Add runtime management page
- [ ] Add dedicated agent management page
- [ ] Add members page
- [ ] Add settings page
- [ ] Add create channel flow
- [ ] Add direct-message creation flow for user <-> Agent chat
- [ ] Add responsive mobile behavior for the full workbench

## 6. Realtime And Collaboration

- [ ] Add WebSocket server transport to the control plane
- [ ] Publish `channel.message.created` events to connected clients
- [ ] Publish `task.created` and `task.updated` events
- [ ] Publish `agent.status.changed` events
- [ ] Subscribe in the web app and update local UI state in realtime
- [ ] Add reconnect and backoff strategy for realtime clients

## 7. Agent Daemon

- [x] Add daemon CLI bootstrap for runtime registration and heartbeat
- [x] Add daemon client tests against the control-plane app
- [x] Add persistent local runtime credential storage after registration
- [x] Add runtime heartbeat loop instead of one-shot heartbeat
- [ ] Add daemon config file support
- [ ] Add task polling or push subscription model
- [ ] Add task execution lifecycle reporting to `/agent/task-events`
- [x] Integrate `rivet-dev/agent-os` as the real runtime daemon host
- [ ] Add channel-aware Agent response flow

## 8. Tasks And Workflow

- [x] Support creating a task from a source message
- [x] Support assigning the task to the first seeded Agent in the demo flow
- [ ] Add task state transitions: `open -> assigned -> running -> done/failed/cancelled`
- [ ] Add blocked and retry handling
- [ ] Add task result payloads and result messages in the channel
- [ ] Add task filtering and search in the UI
- [ ] Add assignment to human users as well as Agents
- [ ] Add audit trail for task reassignment and cancellation

## 9. Quality And Testing

- [x] Add shared domain tests
- [x] Add control-plane API tests
- [x] Add daemon client tests
- [x] Add web API client tests
- [x] Add repository integration tests against Postgres
- [ ] Add end-to-end browser tests for login, messaging, and task creation
- [ ] Add tests for permission boundaries
- [ ] Add tests for revoked Agent behavior
- [ ] Add tests for realtime event delivery
- [ ] Add tests for database-backed bootstrap payload generation

## 10. Observability And Operations

- [ ] Add structured logging for control-plane requests and daemon activity
- [ ] Add health checks for database connectivity and background workers
- [ ] Add metrics for message throughput, task throughput, and Agent heartbeat freshness
- [ ] Add audit log viewer endpoint or admin page
- [ ] Add environment variable documentation for all apps
- [ ] Add Docker or compose-based local environment

## 11. Suggested Execution Order

- [ ] Phase A: persistence and auth hardening
- [ ] Phase B: channel management and task updates
- [ ] Phase C: realtime transport
- [ ] Phase D: daemon execution lifecycle and `agent-os`
- [ ] Phase E: admin surfaces, observability, and end-to-end tests

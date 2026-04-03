# Issues System Migration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the `tasks` concept from the product and replace it with a single `issues` domain model, API surface, storage layer, and Kanban-first UI.

**Architecture:** The migration starts in `packages/shared` so the issue schema, status enum, DTOs, and domain operations become the single source of truth. Then `apps/control-plane` replaces task persistence and routes with issue equivalents, and finally `apps/web` swaps task-oriented UI and API calls for issue flows, adds a new `Kanban` navigation entry under the VS Code-style activity bar, and renders issues from the unified `issues` payload.

**Tech Stack:** Bun, TypeScript, Zod, Hono, React, Vite, Tailwind CSS.

### Task 1: Replace Shared Task Domain With Issue Domain

**Files:**
- Modify: `packages/shared/src/domain/workspace.ts`
- Modify: `packages/shared/src/contracts.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain/workspace.test.ts`

**Step 1: Write the failing tests**

Add tests that prove:
- `WorkspaceSnapshot` exposes `issues`, not `tasks`
- issue creation stores only the new canonical fields
- issue status is one of `todo | doing | done | blocked`
- source channel is nullable for global issues
- runtime pull / event APIs work against issues

**Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/domain/workspace.test.ts`
Expected: FAIL with missing `Issue` types / functions / fields.

**Step 3: Write minimal implementation**

Implement:
- `IssueStatus`, `IssuePriority`, `Issue`
- `IssueDTO`
- `createIssueFromMessage`, `createIssueFromMessages`
- `claimRuntimeIssues`
- `recordAgentIssueEvent`
- bootstrap payload and contracts using `issues`

Preserve current behavior only where still needed for daemon execution and message writeback.

**Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/domain/workspace.test.ts`
Expected: PASS

### Task 2: Replace Control Plane Storage and Routes

**Files:**
- Modify: `apps/control-plane/db/schema.sql`
- Modify: `apps/control-plane/src/storage/types.ts`
- Modify: `apps/control-plane/src/storage/in-memory.ts`
- Modify: `apps/control-plane/src/storage/postgres.ts`
- Modify: `apps/control-plane/src/app.ts`
- Test: `apps/control-plane/src/app.test.ts`
- Test: `apps/control-plane/src/storage/postgres.test.ts`

**Step 1: Write the failing tests**

Update tests to expect:
- `issues` in workspace bootstrap
- `POST /messages/:messageId/issues`
- `POST /issues/from-messages`
- `POST /runtime/issues/pull`
- `POST /agent/issue-events`

Update persisted schema expectations to:
- use `issues` table
- use canonical issue fields
- allow `source_channel_id` to be nullable and without channel foreign key

**Step 2: Run tests to verify they fail**

Run:
- `bun test apps/control-plane/src/app.test.ts`
- `bun test apps/control-plane/src/storage/postgres.test.ts`

Expected: FAIL on old task endpoints and task-shaped payloads.

**Step 3: Write minimal implementation**

Implement:
- `issues` table and repository queries
- storage interface methods renamed from task to issue
- route replacements and response payload replacements
- bootstrap serialization using `issues`

Keep temporary compatibility only if required to unblock downstream changes, then remove it.

**Step 4: Run tests to verify they pass**

Run:
- `bun test apps/control-plane/src/app.test.ts`
- `bun test apps/control-plane/src/storage/postgres.test.ts`

Expected: PASS

### Task 3: Replace Agent Daemon Task Flow With Issue Flow

**Files:**
- Modify: `apps/agent-daemon/src/client.ts`
- Modify: `apps/agent-daemon/src/runtime.ts`
- Test: `apps/agent-daemon/src/client.test.ts`
- Test: `apps/agent-daemon/src/runtime.test.ts`

**Step 1: Write the failing tests**

Update daemon tests to expect:
- runtime pulls issues, not tasks
- daemon prompt payload references issues
- agent writeback posts issue events, not task events

**Step 2: Run tests to verify they fail**

Run:
- `bun test apps/agent-daemon/src/client.test.ts`
- `bun test apps/agent-daemon/src/runtime.test.ts`

Expected: FAIL on renamed endpoints / DTOs.

**Step 3: Write minimal implementation**

Implement the renamed API calls and runtime orchestration using issue DTOs. Preserve the current execution semantics so agents can still claim work and post completion back.

**Step 4: Run tests to verify they pass**

Run:
- `bun test apps/agent-daemon/src/client.test.ts`
- `bun test apps/agent-daemon/src/runtime.test.ts`

Expected: PASS

### Task 4: Replace Web Task UI With Issue UI and Add Kanban

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/lib/api.test.ts`
- Modify: `apps/web/src/lib/inspection-rail.ts`
- Modify: `apps/web/src/lib/theme.ts`
- Modify: `apps/web/src/lib/layout-state.ts`
- Modify: `apps/web/src/lib/shell-state.ts`
- Modify: `apps/web/src/lib/shell-state.test.ts`
- Modify: `apps/web/src/app.tsx`

**Step 1: Write the failing tests**

Update web tests to expect:
- bootstrap payload uses `issues`
- API client methods create issues, not tasks
- shell navigation includes `kanban`
- UI helper logic references issue status values

**Step 2: Run tests to verify they fail**

Run:
- `bun test apps/web/src/lib/api.test.ts`
- `bun test apps/web/src/lib/shell-state.test.ts`

Expected: FAIL on task references and missing kanban view.

**Step 3: Write minimal implementation**

Implement:
- new `Kanban` activity bar entry under `Chats`
- issue-based detail/inspection helpers
- issue cards and lane grouping for `todo / doing / done / blocked`
- issue creation from messages
- issue list / kanban rendering inspired by the provided Minimals dashboard reference

Use the issue DTO as the only UI truth. Remove task-specific naming from the web app.

**Step 4: Run tests to verify they pass**

Run:
- `bun test apps/web/src/lib/api.test.ts`
- `bun test apps/web/src/lib/shell-state.test.ts`
- `bun run --cwd apps/web build`

Expected: PASS

### Task 5: Repository-Wide Cleanup and Verification

**Files:**
- Modify any remaining `task` references that still describe the old workflow rather than generic human language
- Update docs where needed

**Step 1: Search for leftovers**

Run: `rg -n "\\btask(s)?\\b|TaskDTO|tasks/" packages apps docs`
Expected: only intentional generic language or migration notes remain.

**Step 2: Remove or rename residual code**

Delete obsolete helpers, tests, and routes that only exist for the old task model.

**Step 3: Run verification**

Run:
- `bun test`
- `bun run --cwd apps/web build`
- `bun run typecheck`

Expected: the repo is green, or any remaining failures are documented with exact file references and reasons.

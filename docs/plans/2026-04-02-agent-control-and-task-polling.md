# Agent Control And Task Polling Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add control-plane mediated agent lifecycle controls and runtime task polling so the web UI can control agents and the daemon can claim agent tasks and dispatch them through `runAgentPrompt()`.

**Architecture:** Persist agent lifecycle state on the agent record, queue restart/delete control actions in the control-plane, and let the daemon poll both control actions and assigned tasks. Keep transport HTTP-only and polling-based so the change fits the current Bun + Hono scaffold without adding realtime infrastructure.

**Tech Stack:** TypeScript, Bun, Hono, shared domain/contracts, in-memory storage, Postgres storage, React web client, agent-daemon runtime.

### Task 1: Shared domain and contract surface

**Files:**
- Modify: `packages/shared/src/domain/workspace.ts`
- Modify: `packages/shared/src/contracts.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/domain/workspace.test.ts`

**Step 1: Write the failing tests**

Add tests for agent lifecycle defaults, runtime task claim behavior, and queued control actions.

**Step 2: Run test to verify it fails**

Run: `bun test packages/shared/src/domain/workspace.test.ts`

**Step 3: Write minimal implementation**

Add shared types for agent lifecycle state, restart mode, control action payloads, and task-claim payloads.

**Step 4: Run test to verify it passes**

Run: `bun test packages/shared/src/domain/workspace.test.ts`

### Task 2: Control-plane storage and HTTP endpoints

**Files:**
- Modify: `apps/control-plane/src/storage/types.ts`
- Modify: `apps/control-plane/src/storage/in-memory.ts`
- Modify: `apps/control-plane/src/storage/postgres.ts`
- Modify: `apps/control-plane/src/app.ts`
- Modify: `apps/control-plane/db/schema.sql`
- Test: `apps/control-plane/src/app.test.ts`
- Test: `apps/control-plane/src/storage/postgres.test.ts`

**Step 1: Write the failing tests**

Add API tests for agent control, runtime control-action polling, runtime task claim, and task event completion.

**Step 2: Run test to verify it fails**

Run: `bun test apps/control-plane/src/app.test.ts apps/control-plane/src/storage/postgres.test.ts`

**Step 3: Write minimal implementation**

Implement lifecycle updates, control action queueing/ack, task polling/claim, and task-event writeback.

**Step 4: Run test to verify it passes**

Run: `bun test apps/control-plane/src/app.test.ts apps/control-plane/src/storage/postgres.test.ts`

### Task 3: Daemon polling loops and host controls

**Files:**
- Modify: `apps/agent-daemon/src/client.ts`
- Modify: `apps/agent-daemon/src/runtime.ts`
- Modify: `apps/agent-daemon/src/agent-host.ts`
- Test: `apps/agent-daemon/src/client.test.ts`
- Test: `apps/agent-daemon/src/runtime.test.ts`
- Test: `apps/agent-daemon/src/agent-host.test.ts`

**Step 1: Write the failing tests**

Add tests for control-action polling, start/stop/restart/delete handling, task polling, and task dispatch to `runAgentPrompt()`.

**Step 2: Run test to verify it fails**

Run: `bun test apps/agent-daemon/src/client.test.ts apps/agent-daemon/src/runtime.test.ts apps/agent-daemon/src/agent-host.test.ts`

**Step 3: Write minimal implementation**

Teach the daemon to poll control actions and tasks, apply host lifecycle actions, and report task events after dispatch.

**Step 4: Run test to verify it passes**

Run: `bun test apps/agent-daemon/src/client.test.ts apps/agent-daemon/src/runtime.test.ts apps/agent-daemon/src/agent-host.test.ts`

### Task 4: Web API and chat header controls

**Files:**
- Modify: `apps/web/src/lib/api.ts`
- Modify: `apps/web/src/app.tsx`
- Test: `apps/web/src/lib/api.test.ts`

**Step 1: Write the failing tests**

Add client tests for agent control requests and workspace refresh behavior.

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/lib/api.test.ts`

**Step 3: Write minimal implementation**

Replace local-only lifecycle handling with control-plane API calls and bootstrap refreshes.

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/lib/api.test.ts`

### Task 5: Full verification

**Files:**
- No code changes required if everything is green

**Step 1: Run focused suites**

Run: `bun test packages/shared/src/domain/workspace.test.ts apps/control-plane/src/app.test.ts apps/control-plane/src/storage/postgres.test.ts apps/agent-daemon/src/client.test.ts apps/agent-daemon/src/runtime.test.ts apps/agent-daemon/src/agent-host.test.ts apps/web/src/lib/api.test.ts`

**Step 2: Run typechecks**

Run: `bun run typecheck:shared && bun run typecheck:control-plane && bun run typecheck:agent-daemon && bun run typecheck:web`

**Step 3: Run frontend build**

Run: `bun run --cwd apps/web build`

# Agent Daemon agentOS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Turn `apps/agent-daemon` from a one-shot bootstrap client into a long-running runtime host backed by agentOS-compatible sandbox tooling.

**Architecture:** Keep the current WorkPilot HTTP registration and heartbeat contract intact. Add a daemon runtime service that restores or registers local runtime identity, starts a heartbeat loop, loads the runtime's agents from control-plane bootstrap data, and mirrors those agents into a local sandbox-agent host backed by the local provider. Do not invent task execution APIs that the control-plane does not expose yet; instead, make the host lifecycle real and keep clear seams for future task polling/push integration.

**Tech Stack:** Bun, TypeScript, `sandbox-agent`, `rivetkit`, `@rivet-dev/agent-os-pi`, Bun test

### Task 1: Add daemon lifecycle tests

**Files:**
- Modify: `apps/agent-daemon/src/client.test.ts`
- Create: `apps/agent-daemon/src/runtime.test.ts`

**Step 1: Write the failing test**

Add tests that verify:
- the daemon stores registration state and reuses it on restart
- the daemon heartbeat loop reports `online`
- the daemon loads runtime-scoped agents from bootstrap and syncs them into a host abstraction

**Step 2: Run test to verify it fails**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: FAIL because the runtime lifecycle modules do not exist yet.

**Step 3: Write minimal implementation**

Create runtime lifecycle primitives and a fakeable agent host interface that the tests can drive.

**Step 4: Run test to verify it passes**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: PASS

### Task 2: Implement control-plane and local state wiring

**Files:**
- Modify: `apps/agent-daemon/src/client.ts`
- Modify: `apps/agent-daemon/src/config.ts`
- Create: `apps/agent-daemon/src/state.ts`
- Create: `apps/agent-daemon/src/runtime.ts`

**Step 1: Write the failing test**

Extend tests to cover:
- bootstrap fetch and runtime/agent filtering
- persisted state loading/saving
- heartbeats using restored runtime identity

**Step 2: Run test to verify it fails**

Run: `bun test apps/agent-daemon/src/runtime.test.ts apps/agent-daemon/src/client.test.ts`
Expected: FAIL for missing client/state/runtime functionality.

**Step 3: Write minimal implementation**

Add bootstrap fetching, daemon state persistence, and runtime orchestration.

**Step 4: Run test to verify it passes**

Run: `bun test apps/agent-daemon/src/runtime.test.ts apps/agent-daemon/src/client.test.ts`
Expected: PASS

### Task 3: Integrate agentOS-compatible host startup

**Files:**
- Modify: `apps/agent-daemon/package.json`
- Create: `apps/agent-daemon/src/agent-host.ts`
- Modify: `apps/agent-daemon/src/runtime.test.ts`

**Step 1: Write the failing test**

Add tests that verify:
- the host receives runtime-scoped agents
- syncing is idempotent when the same agents are observed again

**Step 2: Run test to verify it fails**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: FAIL because the host adapter is missing.

**Step 3: Write minimal implementation**

Add a sandbox-agent based host adapter with a local provider and agent installation/sync methods.

**Step 4: Run test to verify it passes**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: PASS

### Task 4: Rewire the CLI entrypoint

**Files:**
- Modify: `apps/agent-daemon/src/index.ts`

**Step 1: Write the failing test**

Cover the entrypoint via runtime-level tests that expect the new lifecycle service to be invoked instead of one-shot register/heartbeat code.

**Step 2: Run test to verify it fails**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: FAIL because `index.ts` still performs single-shot behavior.

**Step 3: Write minimal implementation**

Replace the direct register/heartbeat flow with the new daemon runtime service and keep the no-config help output.

**Step 4: Run test to verify it passes**

Run: `bun test apps/agent-daemon/src/runtime.test.ts`
Expected: PASS

### Task 5: Verify the package

**Files:**
- Modify: `docs/tasks.md`

**Step 1: Run focused verification**

Run: `bun test apps/agent-daemon/src/client.test.ts apps/agent-daemon/src/config.test.ts apps/agent-daemon/src/runtime.test.ts`
Expected: PASS

**Step 2: Run typecheck**

Run: `bun run typecheck:agent-daemon`
Expected: PASS

**Step 3: Update backlog**

Mark the daemon heartbeat loop and `agent-os` integration items as complete if the implementation matches scope.

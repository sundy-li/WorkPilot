# Web UI Visual Hierarchy Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rework the web workspace UI so chat, agents, timeline state, and the active thread read with much stronger visual hierarchy.

**Architecture:** Keep the existing React structure in `apps/web/src/app.tsx`, but move repeated visual semantics into theme helpers so the layout can adopt a consistent three-level panel system. Use CSS variables and a small set of utility classes in `apps/web/src/styles.css` for background layers, accent color, status color, and motion.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Bun test, Vite

### Task 1: Lock the UI semantics in tests

**Files:**
- Modify: `apps/web/src/lib/theme.test.ts`
- Test: `apps/web/src/lib/theme.test.ts`

**Step 1: Write the failing test**

Add tests for:
- agent messages getting a distinct elevated treatment from human messages
- active sidebar items exposing a stronger active accent than inactive items
- running timeline steps getting stronger emphasis than done or pending steps

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/lib/theme.test.ts`
Expected: FAIL because the new helper exports or expected semantics do not exist yet.

**Step 3: Write minimal implementation**

Add the needed helpers to `apps/web/src/lib/theme.ts` and keep them pure.

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/lib/theme.test.ts`
Expected: PASS

### Task 2: Apply the new hierarchy to the app shell

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/styles.css`
- Test: `apps/web/src/lib/theme.test.ts`

**Step 1: Write the failing test**

Use the Task 1 tests as the contract for message, sidebar, and timeline surfaces.

**Step 2: Run test to verify it fails**

Run: `bun test apps/web/src/lib/theme.test.ts`
Expected: FAIL until the new helpers are consumed by the app.

**Step 3: Write minimal implementation**

Update:
- shell backgrounds and panel layering
- active channel / active agent treatments
- human vs agent message surfaces
- detail rail timeline step emphasis
- status pills and dots

**Step 4: Run test to verify it passes**

Run: `bun test apps/web/src/lib/theme.test.ts`
Expected: PASS

### Task 3: Verify integration quality

**Files:**
- Modify: `apps/web/src/app.tsx`
- Modify: `apps/web/src/styles.css`

**Step 1: Run focused verification**

Run: `bun test apps/web/src/lib/theme.test.ts`
Expected: PASS

**Step 2: Run broader frontend verification**

Run: `bun run --cwd apps/web typecheck`
Expected: PASS

**Step 3: Run production build**

Run: `bun run --cwd apps/web build`
Expected: PASS

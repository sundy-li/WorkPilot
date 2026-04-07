# Kanban Board UI Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Kanban board to use status-colored lanes with icons, independent priority colors, and reduced border nesting.

**Architecture:** Add a `getStatusLaneConfig()` helper in `theme.ts` that maps each `IssueStatus` to its icon, colors, and backgrounds. Rewrite the Kanban rendering section in `app.tsx` to consume this config, replacing the inline lane definitions and nested card-in-card structure with a flat soft-container layout.

**Tech Stack:** React, Tailwind CSS v4, Lucide React icons

---

### Task 1: Add `getStatusLaneConfig()` to theme.ts

**Files:**
- Modify: `apps/web/src/lib/theme.ts`

- [ ] **Step 1: Add the lane config type and function**

Add at the bottom of `apps/web/src/lib/theme.ts`:

```ts
export interface StatusLaneConfig {
  id: IssueDTO["status"];
  label: string;
  helper: string;
  icon: string;
  color: string;
  colorLight: string;
  laneBg: string;
  badgeBg: string;
  badgeText: string;
  cardBorder: string;
  dotGlow: string;
}

const STATUS_LANE_CONFIGS: Record<IssueDTO["status"], StatusLaneConfig> = {
  backlog: {
    id: "backlog",
    label: "Backlog",
    helper: "Ready for product grooming",
    icon: "CircleDot",
    color: "#94a3b8",
    colorLight: "#cbd5e1",
    laneBg: "#f8fafc",
    badgeBg: "#f1f5f9",
    badgeText: "#475569",
    cardBorder: "rgba(148,163,184,0.12)",
    dotGlow: "rgba(148,163,184,0.15)",
  },
  todo: {
    id: "todo",
    label: "Todo",
    helper: "Ready for iteration planning",
    icon: "Circle",
    color: "#6366f1",
    colorLight: "#a5b4fc",
    laneBg: "#eef2ff",
    badgeBg: "#e0e7ff",
    badgeText: "#4338ca",
    cardBorder: "rgba(99,102,241,0.12)",
    dotGlow: "rgba(99,102,241,0.15)",
  },
  in_progress: {
    id: "in_progress",
    label: "In Progress",
    helper: "Active development only",
    icon: "Loader",
    color: "#f59e0b",
    colorLight: "#fcd34d",
    laneBg: "#fffbeb",
    badgeBg: "#fef3c7",
    badgeText: "#92400e",
    cardBorder: "rgba(245,158,11,0.12)",
    dotGlow: "rgba(245,158,11,0.15)",
  },
  in_review: {
    id: "in_review",
    label: "In Review",
    helper: "Review, test, and acceptance",
    icon: "Eye",
    color: "#a78bfa",
    colorLight: "#c4b5fd",
    laneBg: "#f5f3ff",
    badgeBg: "#ede9fe",
    badgeText: "#6d28d9",
    cardBorder: "rgba(167,139,250,0.12)",
    dotGlow: "rgba(167,139,250,0.15)",
  },
  done: {
    id: "done",
    label: "Done",
    helper: "Merged, deployed, accepted",
    icon: "Check",
    color: "#10b981",
    colorLight: "#6ee7b7",
    laneBg: "#ecfdf5",
    badgeBg: "#d1fae5",
    badgeText: "#047857",
    cardBorder: "rgba(16,185,129,0.12)",
    dotGlow: "rgba(16,185,129,0.15)",
  },
};

const LANE_ORDER: IssueDTO["status"][] = ["backlog", "todo", "in_progress", "in_review", "done"];

export function getStatusLaneConfigs(): StatusLaneConfig[] {
  return LANE_ORDER.map((id) => STATUS_LANE_CONFIGS[id]);
}

export function getStatusLaneConfig(status: IssueDTO["status"]): StatusLaneConfig {
  return STATUS_LANE_CONFIGS[status];
}

export type PriorityTone = { bg: string; text: string };

const PRIORITY_COLORS: Record<IssueDTO["priority"], PriorityTone> = {
  high: { bg: "#fef2f2", text: "#dc2626" },
  medium: { bg: "#fefce8", text: "#a16207" },
  low: { bg: "#f0fdf4", text: "#15803d" },
};

export function getPriorityColor(priority: IssueDTO["priority"]): PriorityTone {
  return PRIORITY_COLORS[priority];
}
```

- [ ] **Step 2: Verify the file has no syntax errors**

Run: `cd /Users/sundy/work/WorkPilot && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

Expected: No errors related to `theme.ts`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/theme.ts
git commit -m "feat(kanban): add status lane config and priority color helpers"
```

---

### Task 2: Update Lucide imports in app.tsx

**Files:**
- Modify: `apps/web/src/app.tsx:13-43` (imports block)

- [ ] **Step 1: Add new Lucide icons and remove GripVertical**

In the lucide-react import block (lines 13-43), add `Circle, CircleDot, Eye, Loader, Check` and remove `GripVertical`:

Replace:
```ts
import {
  Bot,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Files,
  Folder,
  FolderOpen,
  ClipboardList,
  KanbanSquare,
  CalendarDays,
  LogOut,
  MessageSquareText,
  Monitor,
  PanelRightClose,
  Plus,
  RotateCcw,
  Settings,
  Square,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Layers,
  AtSign,
  UsersRound,
  UserRound,
  GripVertical
} from "lucide-react";
```

With:
```ts
import {
  Bot,
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronRight,
  Circle,
  CircleDot,
  Copy,
  Eye,
  FileText,
  Files,
  Folder,
  FolderOpen,
  ClipboardList,
  KanbanSquare,
  CalendarDays,
  Loader,
  LogOut,
  MessageSquareText,
  Monitor,
  PanelRightClose,
  Plus,
  RotateCcw,
  Settings,
  Square,
  SlidersHorizontal,
  Sparkles,
  Trash2,
  X,
  Layers,
  AtSign,
  UsersRound,
  UserRound
} from "lucide-react";
```

- [ ] **Step 2: Add theme.ts imports**

Find the existing import from `./lib/theme` and add `getStatusLaneConfigs`, `getStatusLaneConfig`, `getPriorityColor`, and `StatusLaneConfig`:

```ts
import {
  // ... existing imports ...
  getStatusLaneConfigs,
  getStatusLaneConfig,
  getPriorityColor,
  type StatusLaneConfig,
} from "./lib/theme";
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "feat(kanban): update lucide imports for status icons"
```

---

### Task 3: Add StatusIcon helper component

**Files:**
- Modify: `apps/web/src/app.tsx` (near the `StatusPill` component, ~line 6664)

- [ ] **Step 1: Add a StatusIcon inline component**

Add this component near the existing `StatusPill` component (around line 6664):

```tsx
function StatusLaneIcon({ config }: { config: StatusLaneConfig }) {
  const iconMap: Record<string, React.ComponentType<{ className?: string }>> = {
    CircleDot,
    Circle,
    Loader,
    Eye,
    Check,
  };
  const IconComponent = iconMap[config.icon] ?? Circle;
  return (
    <div
      className="flex size-7 shrink-0 items-center justify-center rounded-lg"
      style={{
        background: `linear-gradient(135deg, ${config.color}, ${config.colorLight})`,
      }}
    >
      <IconComponent className="size-3.5 text-white" />
    </div>
  );
}
```

- [ ] **Step 2: Verify no syntax errors**

Run: `cd /Users/sundy/work/WorkPilot && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -20`

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "feat(kanban): add StatusLaneIcon component"
```

---

### Task 4: Rewrite the Kanban filter bar

**Files:**
- Modify: `apps/web/src/app.tsx:3971-4010` (filter bar section)

- [ ] **Step 1: Replace the filter bar**

Replace the filter bar section (the `<div>` starting at line 3971 with `mt-4 flex flex-col gap-3 rounded-[1.15rem]...`) with a simpler inline layout:

Old (lines 3971-4010):
```tsx
                <div className="mt-4 flex flex-col gap-3 rounded-[1.15rem] bg-[linear-gradient(180deg,rgba(248,250,252,0.86)_0%,rgba(255,255,255,0.96)_100%)] p-3 ring-1 ring-neutral-200/80 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <SlidersHorizontal className="size-4" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Board Filters</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[480px]">
```

New:
```tsx
                <div className="mt-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="flex items-center gap-2 text-neutral-500">
                    <SlidersHorizontal className="size-4" />
                    <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.16em]">Board Filters</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 lg:min-w-[480px]">
```

And remove the closing `</div>` that corresponds to the old wrapper (the one after the two `</select>` elements, before `</div>` at line ~4011).

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "refactor(kanban): flatten filter bar, remove card wrapper"
```

---

### Task 5: Rewrite the lane container and header

**Files:**
- Modify: `apps/web/src/app.tsx:4013-4087` (lane definitions + lane container + header)

- [ ] **Step 1: Replace the lane definitions array with getStatusLaneConfigs()**

Replace the inline lane array (lines 4015-4026):

Old:
```tsx
                  {([
                    { id: "backlog", label: "Backlog", tone: "neutral" as const, helper: "Ready for product grooming" },
                    { id: "todo", label: "Todo", tone: "neutral" as const, helper: "Ready for iteration planning" },
                    { id: "in_progress", label: "In Progress", tone: "warning" as const, helper: "Active development only" },
                    { id: "in_review", label: "In Review", tone: "warning" as const, helper: "Review, test, and acceptance" },
                    { id: "done", label: "Done", tone: "success" as const, helper: "Merged, deployed, accepted" }
                  ] as Array<{
                    id: IssueDTO["status"];
                    label: string;
                    tone: "neutral" | "warning" | "success";
                    helper: string;
                  }>).map((lane) => {
```

New:
```tsx
                  {getStatusLaneConfigs().map((lane) => {
```

- [ ] **Step 2: Replace the lane `<section>` container styling**

Old (lines 4031-4037):
```tsx
                      <section
                        key={lane.id}
                        className={`flex min-h-0 flex-col rounded-[1.35rem] p-3 ring-1 shadow-[0_14px_28px_rgba(15,23,42,0.04)] transition ${
                          isDropActive
                            ? "bg-[linear-gradient(180deg,rgba(79,70,229,0.08)_0%,rgba(255,255,255,0.98)_100%)] ring-[color:color-mix(in_srgb,var(--accent)_30%,white)]"
                            : "bg-[var(--panel-elevated)] ring-neutral-200/80"
                        }`}
```

New:
```tsx
                      <section
                        key={lane.id}
                        className={`flex min-h-0 flex-col rounded-2xl border-l-[3px] p-3 transition ${
                          isDropActive
                            ? "ring-2 ring-[color:color-mix(in_srgb,var(--accent)_30%,white)]"
                            : ""
                        }`}
                        style={{
                          borderLeftColor: lane.color,
                          backgroundColor: lane.laneBg,
                        }}
```

- [ ] **Step 3: Replace the lane header**

Old (lines 4060-4087):
```tsx
                        <div className="mb-3 rounded-[1rem] bg-white/74 px-3 py-3 ring-1 ring-neutral-200/70">
                          <div className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3">
                              <span
                                className={`inline-flex min-w-10 items-center justify-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] ${
                                  lane.tone === "success"
                                    ? "bg-emerald-100 text-emerald-700"
                                    : lane.tone === "warning"
                                      ? "bg-amber-100 text-amber-700"
                                      : "bg-slate-100 text-slate-700"
                                }`}
                              >
                                {laneIssues.length}
                              </span>
                              <div>
                                <p className="text-sm font-semibold text-neutral-950">{lane.label}</p>
                                <p className="mt-1 text-xs text-neutral-500">{isDropActive ? "Drop here to move issue" : lane.helper}</p>
                              </div>
                            </div>
                            <button
                              className="panel-control flex size-9 items-center justify-center rounded-xl text-neutral-700"
                              onClick={() => handleOpenIssueCreateModal(lane.id)}
                              type="button"
                            >
                              <Plus className="size-4" />
                            </button>
                          </div>
                        </div>
```

New:
```tsx
                        <div className="mb-3 flex items-center gap-2.5 px-1 py-2">
                          <StatusLaneIcon config={lane} />
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-bold text-neutral-950">{lane.label}</p>
                            <p className="text-[11px]" style={{ color: lane.badgeText }}>
                              {isDropActive ? "Drop here to move issue" : lane.helper}
                            </p>
                          </div>
                          <span
                            className="inline-flex min-w-7 items-center justify-center rounded-full px-2 py-0.5 text-[11px] font-bold"
                            style={{ backgroundColor: lane.badgeBg, color: lane.badgeText }}
                          >
                            {laneIssues.length}
                          </span>
                          <button
                            className="panel-control flex size-8 items-center justify-center rounded-lg text-neutral-600"
                            onClick={() => handleOpenIssueCreateModal(lane.id)}
                            type="button"
                          >
                            <Plus className="size-3.5" />
                          </button>
                        </div>
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "refactor(kanban): rewrite lane container and header with status colors"
```

---

### Task 6: Rewrite the issue card

**Files:**
- Modify: `apps/web/src/app.tsx:4100-4174` (issue card `<article>`)

- [ ] **Step 1: Replace the issue card markup**

Replace the entire `<article>` block (lines 4102-4174) with:

```tsx
                                <article
                                  key={issue.id}
                                  className={`group rounded-xl bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.06)] transition ${
                                    draggingIssueId === issue.id
                                      ? "scale-[0.98] rotate-[1deg] opacity-60"
                                      : "cursor-grab hover:-translate-y-0.5 hover:shadow-[0_4px_12px_rgba(0,0,0,0.08)]"
                                  }`}
                                  style={{ borderWidth: 1, borderStyle: "solid", borderColor: lane.cardBorder }}
                                  draggable
                                  onClick={() => handleOpenIssueWorkspace(issue.id)}
                                  onDragStart={(event) => {
                                    event.dataTransfer.effectAllowed = "move";
                                    event.dataTransfer.setData("text/plain", issue.id);
                                    setDraggingIssueId(issue.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggingIssueId(null);
                                    setKanbanDropLane(null);
                                  }}
                                >
                                  <div className="flex items-center gap-2">
                                    <div
                                      className="size-2 shrink-0 rounded-full"
                                      style={{
                                        backgroundColor: lane.color,
                                        boxShadow: `0 0 0 3px ${lane.dotGlow}`,
                                      }}
                                    />
                                    <p className="min-w-0 flex-1 truncate text-sm font-semibold text-neutral-950">
                                      {issue.title}
                                    </p>
                                    {issue.assigneeId ? (
                                      <div
                                        className="flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-bold"
                                        style={{
                                          backgroundColor: getAvatarPalette(issue.assigneeId).background,
                                          color: getAvatarPalette(issue.assigneeId).foreground,
                                        }}
                                      >
                                        {getAvatarInitials(
                                          workspace?.agents.find((a) => a.id === issue.assigneeId)?.name ?? issue.assigneeId
                                        )}
                                      </div>
                                    ) : null}
                                  </div>
                                  <p className="mt-2 line-clamp-2 text-[12.5px] leading-[1.55] text-neutral-500">
                                    {issue.description || "No description yet."}
                                  </p>
                                  <div className="mt-3 flex items-center gap-2">
                                    <span
                                      className="rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                      style={{
                                        backgroundColor: getPriorityColor(issue.priority).bg,
                                        color: getPriorityColor(issue.priority).text,
                                      }}
                                    >
                                      {issue.priority}
                                    </span>
                                    <span className="ml-auto flex items-center gap-1 text-[11px] text-neutral-400">
                                      <CalendarDays className="size-3" />
                                      {issue.dueDate ? formatTimestamp(issue.dueDate) : "No date"}
                                    </span>
                                    <button
                                      className="inline-flex items-center gap-1 rounded-md bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-600 opacity-0 transition hover:bg-rose-100 group-hover:opacity-100"
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleDeleteIssue(issue.id);
                                      }}
                                      type="button"
                                    >
                                      <Trash2 className="size-2.5" />
                                      Delete
                                    </button>
                                  </div>
                                </article>
```

- [ ] **Step 2: Update the empty lane placeholder**

Replace the empty lane placeholder (lines 4091-4098):

Old:
```tsx
                            <div className="flex h-full min-h-[240px] items-center justify-center rounded-[1.1rem] bg-white/68 p-6 text-center ring-1 ring-dashed ring-neutral-200/75">
```

New:
```tsx
                            <div className="flex h-full min-h-[240px] items-center justify-center rounded-xl bg-white/60 p-6 text-center" style={{ border: `1px dashed ${lane.cardBorder}` }}>
```

- [ ] **Step 3: Verify no syntax errors**

Run: `cd /Users/sundy/work/WorkPilot && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30`

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app.tsx
git commit -m "refactor(kanban): rewrite issue cards with status dots and priority colors"
```

---

### Task 7: Clean up unused references

**Files:**
- Modify: `apps/web/src/app.tsx`

- [ ] **Step 1: Check if `GripVertical` is used elsewhere**

Search for `GripVertical` in `app.tsx`. If it's only used in the Kanban card (which we removed), the import removal in Task 2 is sufficient. If used elsewhere, keep the import.

- [ ] **Step 2: Verify the full build**

Run: `cd /Users/sundy/work/WorkPilot && npx tsc --noEmit --project apps/web/tsconfig.json 2>&1 | head -30`

Fix any remaining type errors.

- [ ] **Step 3: Visual smoke test**

Run the dev server manually and verify:
- All 5 lanes show distinct colors and icons
- Priority badges show independent colors (high=rose, medium=amber, low=green)
- Delete button only appears on hover
- Drag and drop still works
- Filter bar is flat (no card wrapper)
- Cards have minimal borders

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app.tsx apps/web/src/lib/theme.ts
git commit -m "refactor(kanban): clean up unused imports and verify build"
```

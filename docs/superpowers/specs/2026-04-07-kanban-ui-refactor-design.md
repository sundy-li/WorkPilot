# Kanban Board UI Refactor Design

## Problem

当前 Kanban 页面存在 4 个核心问题：

1. **Border 嵌套过深** — Lane(ring) → Header(ring) → Card(ring) → Pill(border)，四层边框叠加，视觉噪音重
2. **状态没有视觉区分** — 5 个 lane 外观一致，仅靠文字区分状态
3. **Priority 颜色跟随 lane tone** — high priority 在 Backlog 显示灰色，在 In Progress 显示黄色，语义混乱
4. **信息密度不均** — GripVertical 占空间但价值低（整卡已 draggable），Delete 按钮直接暴露易误触

## Design Direction

**柔和容器（Soft Container）** — 保留 lane 分组感，但大幅减少边框层级。

## Status Icon & Color System

每个 status 有独立的 icon、颜色和语义色板：

| Status | Icon (Lucide) | Color Family | Left Border | Lane BG | Badge BG | Badge Text |
|--------|--------------|-------------|-------------|---------|----------|------------|
| backlog | `Circle` (带中心点) | slate | `#94a3b8` | `#f8fafc` | `#f1f5f9` | `#475569` |
| todo | `Circle` | indigo | `#6366f1` | `#eef2ff` | `#e0e7ff` | `#4338ca` |
| in_progress | `Loader` (sun-like) | amber | `#f59e0b` | `#fffbeb` | `#fef3c7` | `#92400e` |
| in_review | `Eye` | violet | `#a78bfa` | `#f5f3ff` | `#ede9fe` | `#6d28d9` |
| done | `Check` | emerald | `#10b981` | `#ecfdf5` | `#d1fae5` | `#047857` |

Icon 渲染方式：28x28 圆角方块，gradient 背景（深→浅），白色 stroke icon。

卡片内 title 前使用 8px status dot（带 3px glow ring），颜色与 lane 一致。

## Priority Independent Colors

Priority 不再跟随 lane tone，使用固定颜色：

| Priority | BG | Text | 语义 |
|----------|-----|------|------|
| high | `#fef2f2` | `#dc2626` | rose — 紧急 |
| medium | `#fefce8` | `#a16207` | amber — 注意 |
| low | `#f0fdf4` | `#15803d` | green — 轻松 |

渲染为小型 rounded badge（`border-radius: 6px`），不用 pill 的 monospace 大写风格，改为 `text-[10px] font-bold uppercase tracking-wide`。

## Lane Structure (Before → After)

### Before
```
<section ring-1 ring-neutral-200 rounded-[1.35rem] bg-panel-elevated>   ← Lane 容器 (ring)
  <div ring-1 ring-neutral-200 rounded-[1rem] bg-white/74>              ← Header 卡片 (ring)
    <span bg-slate-100>3</span> <p>In Progress</p>
  </div>
  <article ring-1 ring-neutral-200 rounded-[1.1rem] bg-white/84>        ← Issue 卡片 (ring)
    <GripVertical />
    <StatusPill tone={lane.tone}>{priority}</StatusPill>                 ← Priority 用 lane tone
    <button>Delete</button>                                              ← 始终可见
  </article>
</section>
```

### After
```
<section rounded-2xl border-l-[3px] border-l-{status-color} bg-{status-bg}>  ← Lane: 左彩色条 + 浅色背景, 无 ring
  <div>                                                                        ← Header: 直接内联, 无卡片包裹
    <StatusIcon /> <p>In Progress</p> <CountBadge />
  </div>
  <article rounded-xl border border-{status-color}/12 bg-white>               ← Card: 极淡 border
    <StatusDot color={status-color} />                                         ← 状态点
    <PriorityBadge priority={priority} />                                      ← 独立颜色
    <button class="opacity-0 group-hover:opacity-100">Delete</button>          ← Hover 显示
  </article>
</section>
```

## Card Layout Changes

### Remove
- `GripVertical` drag handle icon — 整张卡片已经 `draggable`，handle 冗余
- `StatusPill` component on card — 替换为 `PriorityBadge`
- 始终可见的 Delete 按钮

### Add
- Status dot (8px) 在 title 前，带 glow ring
- `group` class on `<article>`，Delete 按钮用 `opacity-0 group-hover:opacity-100`

### Modify
- Description: `line-clamp-3` → `line-clamp-2`
- Card border: `ring-1 ring-neutral-200/80` → `border border-{status-color}/12`（极淡，与 lane 同色系）
- Card radius: `rounded-[1.1rem]` → `rounded-xl`（12px，更紧凑）
- Card shadow: 保留现有微阴影

## Lane Header Changes

- 去掉 `rounded-[1rem] bg-white/74 ring-1 ring-neutral-200/70` 的卡片包裹
- Header 直接作为 flex row 内联在 lane 顶部
- 左侧：StatusIcon（28x28 gradient 方块）+ lane label + helper text
- 右侧：count badge（使用 lane 色系）+ add button

## Filter Bar Changes

- 去掉外层 `rounded-[1.15rem] ring-1 ring-neutral-200/80` 的卡片包裹
- Filter controls 直接内联在 header 区域，减少一层嵌套

## Implementation Scope

所有改动集中在一个文件：`apps/web/src/app.tsx`（Kanban 渲染区域 ~line 3951-4184）

辅助改动：
- `apps/web/src/lib/theme.ts` — 新增 `getStatusLaneConfig()` 函数，返回每个 status 的 icon name、颜色、背景色等
- 不需要新增 CSS class，全部用 Tailwind utility

## Out of Scope

- 拖拽交互逻辑不变
- Issue 详情页不改
- 创建 issue modal 不改
- 数据模型不变

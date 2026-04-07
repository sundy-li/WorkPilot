# WorkPilot

面向智能体协作的工作空间，提供频道聊天、Agent 私聊、Runtime Daemon 挂载、任务分发与 Issue 协作闭环。

English documentation: [README.md](./README.md)

## WorkPilot 是什么

WorkPilot 把原本分散在多个系统里的能力收敛到一个工作空间里：

- 一个支持频道和 Agent 私聊的 Web 工作台
- 一个负责组织、运行时、Agent、消息和 Issue 的 Control Plane API
- 一个运行在宿主机上的 Runtime Daemon，用来执行 Agent 任务
- 一套共享的领域模型和 API Contract，保证前后端与 daemon 行为一致

核心概念如下：

- `Runtime daemon`：注册到工作空间的一台宿主机
- `Agent`：运行在某个 runtime 内的逻辑工作单元
- `Channel`：用户与 Agent 共享的聊天空间
- `Issue`：可分配给 Agent 执行、并由人类 Review 的任务对象

## 主要特性

- 工作空间优先：登录后如果没有 workspace，必须先创建 workspace
- 支持频道聊天和 Agent 私聊
- 可以在 Web 中创建 Agent，并控制启动、停止、重启、删除
- 支持生成 Runtime 安装命令并注册宿主机
- 支持查看 Agent 同步回来的 `memory.md`、`worklog.md` 和 session 文件
- 提供 Kanban 看板和独立的 Issue 详情页
- Issue 支持活动时间线、评论、执行日志和 Review 流程
- 聊天页面可以看到 Agent 实时状态与运行日志
- 支持 Core、Mint、Amber、Rose 四种主题

## 架构组成

### Web App

- React 19
- Vite 7
- Tailwind CSS v4

### Control Plane

- Bun
- Hono
- PostgreSQL

### Agent Daemon

- Bun
- `sandbox-agent`
- 本地 Agent 工作目录持久化，默认位于 `~/.workpilot/agents/<agentId>/`

## 目录结构

```text
apps/
  web/             React 前端
  control-plane/   Bun + Hono API 服务
  agent-daemon/    Runtime Daemon

packages/
  shared/          领域模型与 API Contract
  ui/              共享 UI 组件

docs/
  architect.md     架构文档
```

## 环境要求

- Bun `1.3.5` 或更高版本
- PostgreSQL
- 一台可以运行 agent daemon 的宿主机

## 快速开始

### 1. 安装依赖

```bash
bun install
```

### 2. 配置环境变量

基于 `.env.example` 创建 `.env.local` 或 `.env`：

```bash
PORT=3001
CONTROL_PLANE_URL=http://localhost:3001
WEB_ORIGIN=http://localhost:3000
DATABASE_URL=postgres://admin:change-me@127.0.0.1:5432/workpilot
```

注意：

- 正常运行的 control-plane 依赖 PostgreSQL
- in-memory 存储只用于测试，不用于实际运行

### 3. 同步数据库 Schema

```bash
bun run db:sync
```

### 4. 启动服务

分别在不同终端里执行：

```bash
bun run dev:control-plane
bun run dev:web
```

默认地址：

- Web UI: `http://localhost:3000`
- Control Plane: `http://localhost:3001`

## 首次使用流程

1. 打开 Web UI
2. 注册或登录用户
3. 如果当前用户没有任何 workspace，先创建一个 workspace
4. 打开 Runtime 页面，生成注册 token
5. 在目标宿主机上启动 runtime daemon
6. 在该 runtime 下创建一个或多个 agent
7. 开始和 agent 聊天，或者把 issue 分配给 agent 执行

## 启动 Runtime Daemon

建议直接使用 UI 里生成的安装命令，或者手动执行：

```bash
bun run --cwd apps/agent-daemon start -- \
  --control-plane-url http://localhost:3001 \
  --registration-token <token>
```

可选参数：

```bash
--node-name <name>
--agent-key <stable-host-key>
--state-path <path>
--workspace-root <path>
--agent-workspace-root <path>
--heartbeat-interval-ms <number>
--message-poll-interval-ms <number>
```

daemon 默认会把本地状态持久化到：

- Runtime 状态：`~/.workpilot/agent-daemon/state.json`
- 宿主机工作目录：`~/.workpilot/agent-daemon/workspace/`
- Agent 独立工作目录：`~/.workpilot/agents/<agentId>/`

## Agent 本地工作目录

每个 Agent 都有一个稳定的本地目录，并且这些文件会同步到 Web 中供只读查看。

当前结构如下：

```text
~/.workpilot/agents/<agentId>/
  AGENTS.md
  memory.md
  worklog.md
  sessions/
    <conversationKey>/
      transcript.ndjson
      summary.md
```

这些文件用于帮助 Agent 保持长期上下文，同时保证人类可审查。

## Issue 工作流

WorkPilot 的 Issue 流程是面向 Review 的，不是“一次执行完就结束”。

1. 可以直接创建 issue，或者从一条/多条消息转成 issue
2. 把 issue 分配给某个 agent，并将状态设为 `Todo`
3. runtime daemon 领取 issue 后，自动把它改为 `In Progress`
4. agent 执行任务，并写回日志、活动记录和评论
5. agent 执行完成后，issue 自动进入 `In Review`
6. 人类可以发表评论，然后将 issue 改为 `Done`，或者退回 `Todo`
7. 如果退回 `Todo`，agent 下一次处理时会收到之前的活动历史和评论作为上下文

Issue 执行过程中的消息不会混入 agent 的 direct channel，它们属于独立的 issue session。

## 开发命令

```bash
bun run dev:web
bun run dev:control-plane
bun run dev:agent-daemon

bun run db:sync
bun run db:reset

bun test
bun run typecheck
bun run --cwd apps/web build
```

## 当前状态

WorkPilot 适合本地开发和内部协作场景，但仍然处于快速演进中。

当前已知缺口包括：

- 还没有 WebSocket / push，当前仍以 polling 为主
- 生产级认证体系还不完整
- Postgres 迁移体系仍以 schema sync 为主
- 部分 runtime 和 issue 流程还在持续打磨

## 相关文档

- [docs/architect.md](./docs/architect.md)
- [AGENTS.md](./AGENTS.md)

## License

当前仓库还没有附带 License 文件。

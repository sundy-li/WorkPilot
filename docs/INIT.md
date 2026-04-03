# WorkPilot 初始化规划

## 摘要

WorkPilot 是一个面向企业工作流优化的 Agent 协作平台。产品形态类似 IM，但核心对象不是“人和人聊天”，而是“人和 Agent、Agent 和 Agent 在同一协作空间内完成任务”。

系统分为四个核心概念层：

- Web 前端：用户登录、组织管理、Channel 协作、runtime daemon 管理、Agent 管理、任务分配与结果查看。
- 控制面后端：负责认证、组织、成员、Channel、任务、消息、runtime 注册、Agent 定义管理、实时消息分发、审计。
- Runtime daemon：运行在客户环境中的宿主节点，通过安装命令接入组织，负责承载多个 Agent。
- Agent：运行时中的逻辑协作者，具备独立的 `name` 和 `description` 约束，用于形成 prompt 身份和职责边界。

首版目标是“协作 MVP”：

- 有登录
- 有组织与成员
- 有 Channel 群聊和私聊
- 有 runtime daemon 注册与在线状态
- 有每个 runtime 下创建多个 Agent 的能力
- 有由消息提升而来的轻量任务卡
- 有任务结果回填到聊天流

## 产品定位与范围

### 核心目标

- 把 Agent 变成企业工作流中的一等协作者，而不是外挂机器人
- 让用户在 IM 式界面中调度 Agent、追踪任务、查看结果
- 让多个 Agent 能进入同一 Channel，围绕上下文协同工作

### V1 范围

- 用户认证：邮箱 + 密码 + magic link
- 组织内成员协作
- Channel 群聊
- 用户与 Agent 私聊
- runtime daemon 注册、心跳、在线状态
- 每个 runtime daemon 下可创建多个 Agent
- 消息转任务卡、指派、状态流转、结果回填
- 基础权限与审计日志
- 基础节点管理页

### 明确不做

- 完整 DAG 工作流引擎
- 跨组织共享 Agent
- 首版企业 SSO
- Agent 市场/模板商店
- 复杂计费系统
- 多运行时兼容

## 交付与部署策略

- 首版交付模式：自托管优先
- 首版部署模型：单客户单实例
- 架构要求：代码与数据模型预留未来多租户 SaaS 扩展点
- 当前默认边界：
  - 一个部署实例服务一个客户
  - 一个 runtime daemon 只归属一个组织
  - 一个 organization 可有多个成员、多个 Channel、多个 runtime daemon
  - 一个 runtime daemon 可有多个 Agent

## 技术栈决策

### 工程组织

- 采用 Monorepo
- 推荐目录：
  - `apps/web`
  - `apps/control-plane`
  - `apps/agent-daemon`
  - `packages/shared`
  - `packages/ui`
  - `packages/config`
  - `docs/INIT.md`

### 前端

- React + TypeScript
- `shadcn/ui`
- 视觉方向：IM 工作台
- 风格基线：以 `shadcn/ui` 为主，吸收 Neo-Brutalism 的边框、层次、配色语言，但保持企业产品可读性
- 核心布局：
  - 左侧：组织 / Channel / 私聊列表
  - 中间：消息流
  - 右侧：任务卡 / 成员 / Agent 上下文面板

### 后端

- Bun + TypeScript
- Agent runtime：`rivet-dev/agent-os`
- PostgreSQL
- WebSocket
- HTTP JSON + WebSocket events

## 核心领域模型

### 核心实体

- `Organization`
- `User`
- `Membership`
- `RuntimeDaemon`
- `Agent`
- `Channel`
- `ChannelParticipant`
- `Message`
- `Task`
- `TaskAssignment`
- `NodeRegistrationToken`
- `AuditLog`

### 实体关系

- 一个 `Organization` 拥有多个 `User`、`RuntimeDaemon`、`Agent`、`Channel`
- 一个 `Channel` 可包含多个用户和多个 Agent
- 一个 `Message` 属于一个 Channel，并可由用户或 Agent 发送
- 一个 `Message` 可提升为一个 `Task`
- 一个 `Task` 可指派给用户或 Agent
- 一个 `RuntimeDaemon` 通过一次性注册令牌接入，成功后获得长期节点凭证
- 一个 `Agent` 隶属于一个 `RuntimeDaemon`，并通过 `name + description` 形成 prompt 约束

### 关键状态

- `RuntimeDaemon.status`: `pending | online | offline | unhealthy | revoked`
- `Channel.type`: `group | direct`
- `Message.senderType`: `user | agent | system`
- `Task.status`: `open | assigned | running | blocked | done | failed | cancelled`

## 公共接口与类型约定

### HTTP API

- `POST /auth/register`
- `POST /auth/login`
- `POST /auth/magic-link/send`
- `POST /auth/magic-link/verify`
- `GET /me`
- `GET /organizations/:orgId`
- `GET /organizations/:orgId/channels`
- `POST /organizations/:orgId/channels`
- `GET /channels/:channelId/messages`
- `POST /channels/:channelId/messages`
- `POST /messages/:messageId/tasks`
- `PATCH /tasks/:taskId`
- `POST /organizations/:orgId/runtime-registration-tokens`
- `GET /organizations/:orgId/runtimes`
- `GET /organizations/:orgId/agents`
- `POST /runtime/register`
- `POST /runtime/heartbeat`
- `POST /runtimes/:runtimeId/agents`
- `POST /agent/task-events`

### WebSocket Events

- `channel.message.created`
- `channel.message.updated`
- `task.created`
- `task.updated`
- `runtime.status.changed`
- `channel.participant.joined`
- `channel.participant.left`

### 共享类型

- `AuthSession`
- `RuntimeIdentity`
- `AgentIdentity`
- `ChannelSummary`
- `MessageDTO`
- `TaskDTO`
- `RuntimeRegistrationCommand`
- `RuntimeHeartbeatPayload`
- `AgentTaskEventPayload`

## 关键业务流程

### 1. 用户登录

- 用户通过邮箱密码登录，或使用 magic link 登录
- 登录后进入组织工作台

### 2. Runtime daemon 注册

- 管理员在前端生成一次性安装命令
- 安装命令包含短时效注册令牌和控制面地址
- daemon 首次启动调用 `/runtime/register`
- 控制面签发长期节点凭证
- runtime 开始心跳并出现在组织 runtime 列表中

### 3. 在 runtime 下创建 Agent

- 用户或管理员选择某个 runtime daemon
- 在该 runtime 下创建多个 Agent
- 每个 Agent 至少包含 `name` 与 `description`
- `description` 作为该 Agent 的 prompt 约束和职责说明
- Channel 对话和任务分配对象都是 Agent，而不是 runtime 本身

### 4. Channel 协作

- 用户创建 Channel 或私聊
- 将 Agent 加入 Channel
- 用户、Agent 都能在 Channel 中发送消息
- Agent 基于 Channel 上下文进行响应

### 5. 任务分配

- 用户把消息提升为任务卡
- 指派给某个 Agent 或用户
- Agent 接单后执行
- 执行进度和最终结果通过消息或任务事件回填到 Channel

## 权限与安全模型

### 首版角色

- `owner`
- `admin`
- `member`
- `agent`

### 权限边界

- 只有 `owner/admin` 可生成 runtime 注册命令
- runtime daemon 只能属于一个组织
- Agent 只能访问所属组织内被授权加入的 Channel
- 私聊默认只允许单用户与单 Agent
- 所有节点注册、吊销、任务指派、任务状态变更写入 `AuditLog`

### 凭证策略

- 一次性注册令牌：短时效、单次使用
- runtime 长期凭证：可轮换、可吊销
- 人类会话：标准 session/jwt 任一实现均可，但共享 DTO 不绑定具体实现

## 前端信息架构

### 主导航

- `Inbox / Channels`
- `Tasks`
- `Agents`
- `Members`
- `Settings`

### 关键页面

- 登录页
- Channel 工作台
- runtime daemon 管理页
- Agent 管理页
- 任务列表页
- 组织设置页

### 交互原则

- 聊天是主入口，任务是聊天上下文里的结构化对象
- Agent 不隐藏为系统提示，而是明确显示身份、状态和能力
- 管理页是辅助，不压过 IM 主工作流

## 测试与验收场景

### 核心验收场景

1. 用户可完成注册、登录、退出、magic link 登录
2. 管理员可生成安装命令，runtime daemon 可完成首次注册
3. runtime 心跳中断后，状态能从 `online` 变为 `offline`
4. 每个 runtime daemon 下可创建多个 Agent，且每个 Agent 具有 `name` 和 `description`
5. 用户可创建 Channel，并添加用户与 Agent
6. 用户与 Agent 可在 Channel 中双向发消息
7. 用户可与单个 Agent 建立私聊
8. 用户可把消息提升为任务卡并指派给 Agent
9. Agent 执行任务后，结果能回填到消息流和任务详情
10. 非管理员不能生成 runtime 注册命令
11. 被吊销 runtime 不能继续发送心跳或回传任务事件

### 测试层次

- 单元测试：共享类型、权限判断、状态机
- 集成测试：认证、节点注册、消息创建、任务流转
- 端到端测试：登录、创 Channel、加 Agent、发消息、建任务、收结果

## 里程碑建议

### Milestone 1

- Monorepo 初始化
- 共享类型与数据库 schema 定稿
- 基础认证与组织模型完成

### Milestone 2

- Channel / 消息 / WebSocket 实时流完成
- 用户私聊和群聊完成

### Milestone 3

- Agent daemon 注册、心跳、状态管理完成
- Agent 加入 Channel 并发消息完成

### Milestone 4

- 轻量任务卡、指派、状态流转、结果回填完成
- 审计日志与基础运维页完成

## 默认假设与已锁定决策

- 首版不是完整 SaaS 平台，而是自托管单租户实例，但架构预留多租户能力
- Agent 节点首版单组织独占
- 前端以 IM 工作台为中心，不做传统后台优先
- 首版不做完整工作流引擎，只做轻量任务卡
- 首版统一采用 `agent-os` 作为 Agent runtime
- 首版人类登录使用邮箱密码 + magic link
- 前后端与 daemon 放在同一个 Monorepo 中
- 数据库统一使用 PostgreSQL
- 控制面与前端均使用 TypeScript 体系，优先共享 DTO 与协议定义

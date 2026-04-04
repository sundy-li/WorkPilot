import { z } from "zod";

export type MembershipRole = "owner" | "admin" | "member";
export type RuntimeDaemonStatus = "pending" | "online" | "offline" | "unhealthy" | "revoked" | "deleted";
export type ChannelType = "group" | "direct";
export type MessageSenderType = "user" | "agent" | "system";
export type MessageAttachmentKind = "image" | "file";
export type IssueStatus = "backlog" | "todo" | "in_progress" | "in_review" | "done";
export type IssuePriority = "low" | "medium" | "high";
export type AgentImplementation = "claude" | "codex" | "opencode" | "pi";
export type AgentReasoningEffort = "low" | "medium" | "high";
export type AgentLifecycleState = "running" | "stopped" | "deleted";
export type AgentRestartMode = "restart" | "reset_session" | "full_reset";
export type AgentControlActionType = "start" | "stop" | "restart" | "delete";

export interface Organization {
  id: string;
}

export interface RuntimeRegistrationToken {
  id: string;
  organizationId: string;
  token: string;
  createdBy: string;
  expiresAt: string;
  usedAt: string | null;
  usedRuntimeKey: string | null;
}

export interface RuntimeDaemon {
  id: string;
  organizationId: string;
  name: string;
  runtimeKey: string;
  status: RuntimeDaemonStatus;
  credentialId: string;
  registeredAt: string;
  lastHeartbeatAt: string | null;
}

export interface AgentProfile {
  id: string;
  organizationId: string;
  runtimeId: string;
  channelId: string;
  name: string;
  description: string;
  implementation: AgentImplementation;
  model: string;
  reasoningEffort: AgentReasoningEffort;
  status: AgentLifecycleState;
  createdAt: string;
}

export interface AgentMessageClaim {
  id: string;
  organizationId: string;
  runtimeId: string;
  agentId: string;
  sourceMessageId: string;
  claimedAt: string;
  respondedAt: string | null;
  responseMessageId: string | null;
}

export interface AgentControlAction {
  id: string;
  organizationId: string;
  runtimeId: string;
  agentId: string;
  action: AgentControlActionType;
  restartMode: AgentRestartMode | null;
  requestedAt: string;
  acknowledgedAt: string | null;
}

export interface MessageAttachment {
  id: string;
  name: string;
  mediaType: string;
  size: number;
  kind: MessageAttachmentKind;
  dataUrl: string;
}

export interface Message {
  id: string;
  organizationId: string;
  channelId: string;
  content: string;
  attachments: MessageAttachment[];
  senderId: string;
  senderType: MessageSenderType;
  createdAt: string;
}

export interface Issue {
  id: string;
  organizationId: string;
  title: string;
  description: string;
  status: IssueStatus;
  assigneeId: string | null;
  creatorId: string;
  priority: IssuePriority;
  dueDate: string | null;
  project: string | null;
  sourceChannelId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  organizationId: string;
  action: string;
  actorId: string;
  createdAt: string;
  targetId: string;
}

export interface WorkspaceSnapshot {
  organization: Organization;
  registrationTokens: RuntimeRegistrationToken[];
  runtimes: RuntimeDaemon[];
  agents: AgentProfile[];
  agentControlActions: AgentControlAction[];
  agentMessageClaims: AgentMessageClaim[];
  messages: Message[];
  issues: Issue[];
  auditLogs: AuditLog[];
}

export interface CreateWorkspaceSnapshotInput {
  organizationId: string;
}

export interface CreateRuntimeRegistrationTokenInput {
  actorId: string;
  actorRole: MembershipRole;
  now?: string;
  ttlMs?: number;
}

export interface RegisterRuntimeDaemonInput {
  registrationToken: string;
  runtimeName: string;
  runtimeKey: string;
  now?: string;
}

export interface RecordRuntimeHeartbeatInput {
  runtimeId: string;
  occurredAt?: string;
}

export interface SoftDeleteRuntimeDaemonInput {
  runtimeId: string;
  actorId: string;
  now?: string;
}

export interface ReconcileOfflineRuntimesInput {
  now?: string;
  offlineThresholdMs: number;
}

export interface CreateAgentProfileInput {
  runtimeId: string;
  channelId?: string;
  name: string;
  description: string;
  implementation?: AgentImplementation;
  model?: string;
  reasoningEffort?: AgentReasoningEffort;
  now?: string;
}

export interface QueueAgentControlActionInput {
  agentId: string;
  action: AgentControlActionType;
  restartMode?: AgentRestartMode;
  now?: string;
}

export interface AcknowledgeAgentControlActionInput {
  actionId: string;
  now?: string;
}

export interface CreateMessageInput {
  channelId: string;
  content: string;
  attachments?: Array<Omit<MessageAttachment, "id">>;
  senderId: string;
  senderType: MessageSenderType;
  now?: string;
}

export interface CreateIssueFromMessageInput {
  actorId: string;
  assigneeId: string | null;
  messageId: string;
  title: string;
  description?: string;
  priority?: IssuePriority;
  dueDate?: string | null;
  project?: string | null;
  now?: string;
}

export interface CreateIssueFromMessagesInput {
  actorId: string;
  assigneeId: string | null;
  messageIds: string[];
  title: string;
  description: string;
  priority?: IssuePriority;
  dueDate?: string | null;
  project?: string | null;
  now?: string;
}

export interface CreateIssueInput {
  actorId: string;
  title: string;
  description: string;
  status?: IssueStatus;
  assigneeId: string | null;
  priority?: IssuePriority;
  dueDate?: string | null;
  project?: string | null;
  sourceChannelId?: string | null;
  now?: string;
}

export interface ClaimRuntimeIssuesInput {
  runtimeId: string;
  limit?: number;
  now?: string;
}

export interface RuntimeIssueClaim {
  issue: Issue;
  agent: AgentProfile;
  sourceMessages: Message[];
}

export interface RecordAgentIssueEventInput {
  agentId: string;
  issueId: string;
  status: IssueStatus;
  message?: string;
  occurredAt?: string;
}

export interface ClaimRuntimeAgentMessagesInput {
  runtimeId: string;
  limit?: number;
  now?: string;
}

export interface RuntimeAgentMessageClaim {
  agent: AgentProfile;
  sourceMessage: Message;
  isFirstUserMessage: boolean;
}

export interface RecordAgentMessageResponseInput {
  agentId: string;
  sourceMessageId: string;
  content: string;
  occurredAt?: string;
}

export const messageAttachmentDtoSchema = z.object({
  id: z.string(),
  name: z.string(),
  mediaType: z.string(),
  size: z.number(),
  kind: z.enum(["image", "file"]),
  dataUrl: z.string()
});

export const messageDtoSchema = z.object({
  id: z.string(),
  channelId: z.string(),
  content: z.string(),
  attachments: z.array(messageAttachmentDtoSchema),
  senderId: z.string(),
  senderType: z.enum(["user", "agent", "system"]),
  createdAt: z.string()
});

export const issueDtoSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string(),
  status: z.enum(["backlog", "todo", "in_progress", "in_review", "done"]),
  assigneeId: z.string().nullable(),
  creatorId: z.string(),
  priority: z.enum(["low", "medium", "high"]),
  dueDate: z.string().nullable(),
  project: z.string().nullable(),
  sourceChannelId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string()
});

export type MessageDTO = z.infer<typeof messageDtoSchema>;
export type IssueDTO = z.infer<typeof issueDtoSchema>;

export function createWorkspaceSnapshot(input: CreateWorkspaceSnapshotInput): WorkspaceSnapshot {
  return {
    organization: { id: input.organizationId },
    registrationTokens: [],
    runtimes: [],
    agents: [],
    agentControlActions: [],
    agentMessageClaims: [],
    messages: [],
    issues: [],
    auditLogs: []
  };
}

export function createRuntimeRegistrationToken(
  workspace: WorkspaceSnapshot,
  input: CreateRuntimeRegistrationTokenInput
): RuntimeRegistrationToken {
  if (input.actorRole !== "owner" && input.actorRole !== "admin") {
    throw new Error("Only organization owners or admins can register runtime daemons.");
  }

  const now = input.now ?? new Date().toISOString();
  const ttlMs = input.ttlMs ?? 15 * 60 * 1000;
  const token: RuntimeRegistrationToken = {
    id: createId("rrt"),
    organizationId: workspace.organization.id,
    token: createSecret("wpt"),
    createdBy: input.actorId,
    expiresAt: new Date(Date.parse(now) + ttlMs).toISOString(),
    usedAt: null,
    usedRuntimeKey: null
  };

  workspace.registrationTokens.push(token);
  appendAuditLog(workspace, {
    action: "runtime.registration_token.created",
    actorId: input.actorId,
    targetId: token.id,
    createdAt: now
  });

  return token;
}

export function registerRuntimeDaemon(
  workspace: WorkspaceSnapshot,
  input: RegisterRuntimeDaemonInput
): RuntimeDaemon {
  const now = input.now ?? new Date().toISOString();
  const token = workspace.registrationTokens.find((entry) => entry.token === input.registrationToken);

  if (!token) {
    throw new Error("Registration token is invalid.");
  }

  if (token.usedAt && token.usedRuntimeKey !== input.runtimeKey) {
    throw new Error("Registration token has already been used.");
  }

  if (Date.parse(token.expiresAt) < Date.parse(now)) {
    throw new Error("Registration token has expired.");
  }

  const existingRuntime = workspace.runtimes.find(
    (entry) => entry.runtimeKey === input.runtimeKey && entry.status !== "deleted"
  );

  if (existingRuntime) {
    token.usedAt = token.usedAt ?? now;
    token.usedRuntimeKey = token.usedRuntimeKey ?? input.runtimeKey;
    return existingRuntime;
  }

  token.usedAt = now;
  token.usedRuntimeKey = input.runtimeKey;

  const runtime: RuntimeDaemon = {
    id: createId("rtm"),
    organizationId: workspace.organization.id,
    name: input.runtimeName,
    runtimeKey: input.runtimeKey,
    status: "pending",
    credentialId: createSecret("cred"),
    registeredAt: now,
    lastHeartbeatAt: null
  };

  workspace.runtimes.push(runtime);
  appendAuditLog(workspace, {
    action: "runtime.registered",
    actorId: runtime.id,
    targetId: runtime.id,
    createdAt: now
  });

  return runtime;
}

export function recordRuntimeHeartbeat(
  workspace: WorkspaceSnapshot,
  input: RecordRuntimeHeartbeatInput
): RuntimeDaemon {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const runtime = workspace.runtimes.find((entry) => entry.id === input.runtimeId);

  if (!runtime) {
    throw new Error("Runtime daemon was not found.");
  }

  if (runtime.status === "revoked") {
    throw new Error("Revoked runtime daemons cannot send heartbeats.");
  }

  if (runtime.status === "deleted") {
    throw new Error("Deleted runtime daemons cannot send heartbeats.");
  }

  runtime.lastHeartbeatAt = occurredAt;
  runtime.status = "online";

  appendAuditLog(workspace, {
    action: "runtime.heartbeat.recorded",
    actorId: runtime.id,
    targetId: runtime.id,
    createdAt: occurredAt
  });

  return runtime;
}

export function reconcileOfflineRuntimes(
  workspace: WorkspaceSnapshot,
  input: ReconcileOfflineRuntimesInput
): RuntimeDaemon[] {
  const now = input.now ?? new Date().toISOString();
  const nowTs = Date.parse(now);

  const offlineRuntimes = workspace.runtimes.filter((runtime) => {
    if (!runtime.lastHeartbeatAt || runtime.status === "revoked") {
      return false;
    }

    return nowTs - Date.parse(runtime.lastHeartbeatAt) > input.offlineThresholdMs;
  });

  for (const runtime of offlineRuntimes) {
    runtime.status = "offline";
  }

  return offlineRuntimes;
}

export function softDeleteRuntimeDaemon(
  workspace: WorkspaceSnapshot,
  input: SoftDeleteRuntimeDaemonInput
): RuntimeDaemon {
  const occurredAt = input.now ?? new Date().toISOString();
  const runtime = workspace.runtimes.find((entry) => entry.id === input.runtimeId);

  if (!runtime) {
    throw new Error("Runtime daemon was not found.");
  }

  runtime.status = "deleted";
  runtime.lastHeartbeatAt = occurredAt;

  const runtimeAgents = workspace.agents.filter((agent) => agent.runtimeId === input.runtimeId);
  for (const agent of runtimeAgents) {
    agent.status = "deleted";
  }

  for (const issue of workspace.issues) {
    if (issue.assigneeId && runtimeAgents.some((agent) => agent.id === issue.assigneeId)) {
      issue.assigneeId = null;
      issue.updatedAt = occurredAt;
    }
  }

  appendAuditLog(workspace, {
    action: "runtime.deleted",
    actorId: input.actorId,
    targetId: runtime.id,
    createdAt: occurredAt
  });

  return runtime;
}

export function createAgentProfile(workspace: WorkspaceSnapshot, input: CreateAgentProfileInput): AgentProfile {
  const runtime = workspace.runtimes.find((entry) => entry.id === input.runtimeId);

  if (!runtime) {
    throw new Error("Runtime daemon was not found.");
  }

  const createdAt = input.now ?? new Date().toISOString();
  const agent: AgentProfile = {
    id: createId("agt"),
    organizationId: workspace.organization.id,
    runtimeId: input.runtimeId,
    channelId: input.channelId ?? createId("dir"),
    name: input.name,
    description: input.description,
    implementation: input.implementation ?? "claude",
    model: input.model ?? "claude-sonnet-4.5",
    reasoningEffort: input.reasoningEffort ?? "medium",
    status: "running",
    createdAt
  };

  workspace.agents.push(agent);
  appendAuditLog(workspace, {
    action: "agent.created",
    actorId: runtime.id,
    targetId: agent.id,
    createdAt
  });

  return agent;
}

export function queueAgentControlAction(
  workspace: WorkspaceSnapshot,
  input: QueueAgentControlActionInput
): AgentControlAction {
  const requestedAt = input.now ?? new Date().toISOString();
  const agent = workspace.agents.find((entry) => entry.id === input.agentId);

  if (!agent) {
    throw new Error("Agent was not found.");
  }

  const action: AgentControlAction = {
    id: createId("aca"),
    organizationId: workspace.organization.id,
    runtimeId: agent.runtimeId,
    agentId: agent.id,
    action: input.action,
    restartMode: input.restartMode ?? null,
    requestedAt,
    acknowledgedAt: null
  };

  if (input.action === "start") {
    agent.status = "running";
  }

  if (input.action === "stop") {
    agent.status = "stopped";
  }

  if (input.action === "delete") {
    agent.status = "deleted";

    for (const issue of workspace.issues) {
      if (issue.assigneeId === agent.id) {
        issue.assigneeId = null;
        issue.updatedAt = requestedAt;
      }
    }
  }

  workspace.agentControlActions.push(action);
  appendAuditLog(workspace, {
    action: `agent.control.${input.action}`,
    actorId: agent.id,
    targetId: action.id,
    createdAt: requestedAt
  });

  return action;
}

export function acknowledgeAgentControlAction(
  workspace: WorkspaceSnapshot,
  input: AcknowledgeAgentControlActionInput
): AgentControlAction {
  const action = workspace.agentControlActions.find((entry) => entry.id === input.actionId);

  if (!action) {
    throw new Error("Agent control action was not found.");
  }

  action.acknowledgedAt = input.now ?? new Date().toISOString();

  return action;
}

export function createMessage(workspace: WorkspaceSnapshot, input: CreateMessageInput): Message {
  const createdAt = input.now ?? new Date().toISOString();
  const message: Message = {
    id: createId("msg"),
    organizationId: workspace.organization.id,
    channelId: input.channelId,
    content: input.content,
    attachments: (input.attachments ?? []).map((attachment) => ({
      id: createId("att"),
      ...attachment
    })),
    senderId: input.senderId,
    senderType: input.senderType,
    createdAt
  };

  workspace.messages.push(message);
  return message;
}

export function createIssueFromMessage(workspace: WorkspaceSnapshot, input: CreateIssueFromMessageInput): Issue {
  return createIssueFromMessages(workspace, {
    actorId: input.actorId,
    assigneeId: input.assigneeId,
    messageIds: [input.messageId],
    title: input.title,
    description: input.description ?? "",
    priority: input.priority,
    dueDate: input.dueDate,
    project: input.project,
    now: input.now
  });
}

export function createIssue(workspace: WorkspaceSnapshot, input: CreateIssueInput): Issue {
  const createdAt = input.now ?? new Date().toISOString();
  const issue: Issue = {
    id: createId("iss"),
    organizationId: workspace.organization.id,
    title: input.title,
    description: input.description,
    status: input.status ?? "backlog",
    assigneeId: input.assigneeId,
    creatorId: input.actorId,
    priority: input.priority ?? "medium",
    dueDate: input.dueDate ?? null,
    project: input.project ?? null,
    sourceChannelId: input.sourceChannelId ?? null,
    createdAt,
    updatedAt: createdAt
  };

  workspace.issues.push(issue);
  appendAuditLog(workspace, {
    action: "issue.created",
    actorId: input.actorId,
    targetId: issue.id,
    createdAt
  });

  return issue;
}

export function createIssueFromMessages(workspace: WorkspaceSnapshot, input: CreateIssueFromMessagesInput): Issue {
  const createdAt = input.now ?? new Date().toISOString();
  const messages = input.messageIds
    .map((messageId) => workspace.messages.find((entry) => entry.id === messageId))
    .filter((message): message is Message => Boolean(message));

  if (messages.length !== input.messageIds.length || messages.length === 0) {
    throw new Error("Source message was not found.");
  }

  const [firstMessage] = messages;

  if (messages.some((message) => message.channelId !== firstMessage.channelId)) {
    throw new Error("All source messages must belong to the same channel.");
  }

  return createIssue(workspace, {
    actorId: input.actorId,
    title: input.title,
    description: input.description,
    status: input.assigneeId ? "todo" : "backlog",
    assigneeId: input.assigneeId,
    priority: input.priority,
    dueDate: input.dueDate,
    project: input.project,
    sourceChannelId: firstMessage.channelId,
    now: createdAt
  });
}

export function claimRuntimeIssues(
  workspace: WorkspaceSnapshot,
  input: ClaimRuntimeIssuesInput
): RuntimeIssueClaim[] {
  const claimedAt = input.now ?? new Date().toISOString();
  const limit = input.limit ?? 20;
  const runtimeAgents = workspace.agents.filter((agent) => agent.runtimeId === input.runtimeId && agent.status === "running");
  const runtimeAgentsById = new Map(runtimeAgents.map((agent) => [agent.id, agent]));
  const issues = workspace.issues
    .filter(
      (issue) =>
        issue.status === "todo" &&
        Boolean(issue.assigneeId) &&
        runtimeAgentsById.has(issue.assigneeId as string)
    )
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, limit);

  return issues.map((issue) => {
    issue.status = "in_progress";
    issue.updatedAt = claimedAt;

    appendAuditLog(workspace, {
      action: "issue.claimed",
      actorId: issue.assigneeId ?? input.runtimeId,
      targetId: issue.id,
      createdAt: claimedAt
    });

    return {
      issue,
      agent: runtimeAgentsById.get(issue.assigneeId!)!,
      sourceMessages: issue.sourceChannelId
        ? workspace.messages.filter((message) => message.channelId === issue.sourceChannelId)
        : []
    };
  });
}

export function claimRuntimeAgentMessages(
  workspace: WorkspaceSnapshot,
  input: ClaimRuntimeAgentMessagesInput
): RuntimeAgentMessageClaim[] {
  const claimedAt = input.now ?? new Date().toISOString();
  const limit = input.limit ?? 20;
  const agents = workspace.agents.filter((agent) => agent.runtimeId === input.runtimeId && agent.status === "running");
  const agentsByChannelId = new Map(agents.map((agent) => [agent.channelId, agent]));
  const claimedSourceMessageIds = new Set(workspace.agentMessageClaims.map((claim) => claim.sourceMessageId));

  const messages = workspace.messages
    .filter(
      (message) =>
        message.senderType === "user" &&
        agentsByChannelId.has(message.channelId) &&
        !claimedSourceMessageIds.has(message.id)
    )
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
    .slice(0, limit);

  return messages.map((message) => {
    const agent = agentsByChannelId.get(message.channelId)!;
    const channelUserMessages = workspace.messages.filter(
      (entry) => entry.channelId === message.channelId && entry.senderType === "user"
    );
    const messageIndex = channelUserMessages.findIndex((entry) => entry.id === message.id);
    const earlierUserMessageInChannel = messageIndex > 0;

    workspace.agentMessageClaims.push({
      id: createId("amc"),
      organizationId: workspace.organization.id,
      runtimeId: input.runtimeId,
      agentId: agent.id,
      sourceMessageId: message.id,
      claimedAt,
      respondedAt: null,
      responseMessageId: null
    });

    appendAuditLog(workspace, {
      action: "agent.message.claimed",
      actorId: agent.id,
      targetId: message.id,
      createdAt: claimedAt
    });

    return {
      agent,
      sourceMessage: message,
      isFirstUserMessage: !earlierUserMessageInChannel
    };
  });
}

export function recordAgentIssueEvent(
  workspace: WorkspaceSnapshot,
  input: RecordAgentIssueEventInput
): { issue: Issue; message: Message | null } {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const issue = workspace.issues.find((entry) => entry.id === input.issueId);
  const agent = workspace.agents.find((entry) => entry.id === input.agentId);

  if (!issue) {
    throw new Error("Issue was not found.");
  }

  if (!agent) {
    throw new Error("Agent was not found.");
  }

  issue.status = input.status;
  issue.updatedAt = occurredAt;

  const message =
    input.message && input.message.trim().length > 0
      ? createMessage(workspace, {
          channelId: issue.sourceChannelId ?? agent?.channelId ?? "chn_general",
          content: input.message.trim(),
          senderId: agent.id,
          senderType: "agent",
          now: occurredAt
        })
      : null;

  appendAuditLog(workspace, {
    action: "issue.event.recorded",
    actorId: agent.id,
    targetId: issue.id,
    createdAt: occurredAt
  });

  return {
    issue,
    message
  };
}

export function recordAgentMessageResponse(
  workspace: WorkspaceSnapshot,
  input: RecordAgentMessageResponseInput
): Message {
  const occurredAt = input.occurredAt ?? new Date().toISOString();
  const agent = workspace.agents.find((entry) => entry.id === input.agentId);
  const claim = workspace.agentMessageClaims.find(
    (entry) => entry.agentId === input.agentId && entry.sourceMessageId === input.sourceMessageId
  );

  if (!agent) {
    throw new Error("Agent was not found.");
  }

  if (!claim) {
    throw new Error("Agent message claim was not found.");
  }

  const response = createMessage(workspace, {
    channelId: agent.channelId,
    content: input.content,
    senderId: agent.id,
    senderType: "agent",
    now: occurredAt
  });

  claim.respondedAt = occurredAt;
  claim.responseMessageId = response.id;

  appendAuditLog(workspace, {
    action: "agent.message.responded",
    actorId: agent.id,
    targetId: response.id,
    createdAt: occurredAt
  });

  return response;
}

function appendAuditLog(
  workspace: WorkspaceSnapshot,
  input: Omit<AuditLog, "id" | "organizationId">
): void {
  workspace.auditLogs.push({
    id: createId("aud"),
    organizationId: workspace.organization.id,
    ...input
  });
}

function createId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createSecret(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

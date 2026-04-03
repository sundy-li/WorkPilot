import type {
  AgentControlActionDTO,
  AgentIdentity,
  AgentMessageResponsePayload,
  AgentIssueEventPayload,
  AuthSession,
  ChannelSummary,
  AgentControlRequest,
  IssueDTO,
  MembershipRole,
  MessageDTO,
  RuntimeAgentMessageClaimDTO,
  RuntimeIssueClaimDTO,
  RuntimeIdentity,
  RuntimeRegistrationCommand,
  WorkspaceBootstrapPayload
} from "@workpilot/shared";

export interface CreateRuntimeRegistrationCommandInput {
  organizationId: string;
  actorId: string;
  actorRole: MembershipRole;
  controlPlaneUrl: string;
}

export interface CreateChannelInput {
  organizationId: string;
  name: string;
}

export interface RegisterRuntimeInput {
  registrationToken: string;
  runtimeName: string;
  runtimeKey: string;
}

export interface RecordRuntimeHeartbeatInput {
  runtimeId: string;
  occurredAt?: string;
}

export interface DeleteRuntimeInput {
  runtimeId: string;
  actorId: string;
  occurredAt?: string;
}

export interface CreateAgentInput {
  runtimeId: string;
  name: string;
  description: string;
  implementation?: "claude" | "codex" | "opencode" | "pi";
  model?: string;
  reasoningEffort?: "low" | "medium" | "high";
}

export interface EnsureAgentDirectChannelInput {
  agentId: string;
  userId: string;
}

export interface CreateMessageInput {
  channelId: string;
  content: string;
  attachments?: Array<{
    name: string;
    mediaType: string;
    size: number;
    kind: "image" | "file";
    dataUrl: string;
  }>;
  senderId: string;
  senderType: "user" | "agent" | "system";
}

export interface CreateIssueFromMessageInput {
  messageId: string;
  actorId: string;
  assigneeId: string | null;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

export interface CreateIssueFromMessagesInput {
  messageIds: string[];
  actorId: string;
  assigneeId: string | null;
  title: string;
  description: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

export interface CreateIssueInput {
  actorId: string;
  title: string;
  description: string;
  status?: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  assigneeId: string | null;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
  sourceChannelId?: string | null;
}

export interface UpdateIssueInput {
  issueId: string;
  status?: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  assigneeId?: string | null;
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

export interface ControlAgentInput extends AgentControlRequest {
  agentId: string;
}

export interface AcknowledgeAgentControlActionInput {
  actionId: string;
  occurredAt?: string;
}

export interface PullRuntimeIssuesInput {
  runtimeId: string;
  limit?: number;
  occurredAt?: string;
}

export interface PullRuntimeAgentMessagesInput {
  runtimeId: string;
  limit?: number;
  occurredAt?: string;
}

export interface ControlPlaneStorage {
  getDemoSession(): Promise<AuthSession>;
  getOrganization(orgId: string): Promise<{ id: string } | null>;
  getChannel(channelId: string): Promise<ChannelSummary | null>;
  getChannels(orgId: string): Promise<ChannelSummary[]>;
  createChannel(input: CreateChannelInput): Promise<ChannelSummary>;
  getMessages(channelId: string): Promise<MessageDTO[]>;
  getRuntimes(orgId: string): Promise<RuntimeIdentity[]>;
  getAgents(orgId: string): Promise<AgentIdentity[]>;
  getWorkspaceBootstrap(orgId: string): Promise<WorkspaceBootstrapPayload>;
  createRuntimeRegistrationCommand(input: CreateRuntimeRegistrationCommandInput): Promise<RuntimeRegistrationCommand>;
  registerRuntime(input: RegisterRuntimeInput): Promise<{
    id: string;
    name: string;
    status: string;
    credentialId: string;
    lastHeartbeatAt: string | null;
  }>;
  recordRuntimeHeartbeat(input: RecordRuntimeHeartbeatInput): Promise<{
    id: string;
    status: string;
    lastHeartbeatAt: string | null;
  }>;
  deleteRuntime(input: DeleteRuntimeInput): Promise<{
    runtime: RuntimeIdentity | null;
  }>;
  createAgent(input: CreateAgentInput): Promise<AgentIdentity>;
  ensureAgentDirectChannel(input: EnsureAgentDirectChannelInput): Promise<ChannelSummary>;
  controlAgent(input: ControlAgentInput): Promise<{
    agent: AgentIdentity | null;
    controlAction: AgentControlActionDTO | null;
  }>;
  getRuntimeControlActions(runtimeId: string): Promise<AgentControlActionDTO[]>;
  acknowledgeAgentControlAction(input: AcknowledgeAgentControlActionInput): Promise<AgentControlActionDTO>;
  createMessage(input: CreateMessageInput): Promise<MessageDTO>;
  createIssue(input: CreateIssueInput): Promise<IssueDTO>;
  updateIssue(input: UpdateIssueInput): Promise<IssueDTO>;
  createIssueFromMessage(input: CreateIssueFromMessageInput): Promise<IssueDTO>;
  createIssueFromMessages(input: CreateIssueFromMessagesInput): Promise<IssueDTO>;
  pullRuntimeIssues(input: PullRuntimeIssuesInput): Promise<RuntimeIssueClaimDTO[]>;
  pullRuntimeAgentMessages(input: PullRuntimeAgentMessagesInput): Promise<RuntimeAgentMessageClaimDTO[]>;
  recordAgentIssueEvent(input: AgentIssueEventPayload): Promise<{
    issue: IssueDTO;
    message: MessageDTO | null;
  }>;
  recordAgentMessageResponse(input: AgentMessageResponsePayload): Promise<{
    message: MessageDTO;
  }>;
}

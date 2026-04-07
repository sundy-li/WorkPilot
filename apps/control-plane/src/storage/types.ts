import type {
  AgentActivityDTO,
  AgentActivityEventPayload,
  AgentWorkspaceFileContentDTO,
  AgentWorkspaceFileSummaryDTO,
  AgentControlActionDTO,
  AgentIdentity,
  AgentRunLogDTO,
  AgentRunLogEventPayload,
  AgentMessageResponsePayload,
  AgentIssueEventPayload,
  AuthSession,
  ChannelParticipantDTO,
  ChannelSummary,
  AgentControlRequest,
  IssueActivityDTO,
  IssueDTO,
  MembershipRole,
  MessageDTO,
  PendingAgentResponse,
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

export interface CreateWorkspaceInput {
  userId: string;
  name: string;
  description?: string;
}

export interface CreateChannelInput {
  organizationId: string;
  name: string;
  description?: string;
  actorId?: string;
  members?: Array<{
    participantId: string;
    participantType: "user" | "agent";
  }>;
}

export interface UpdateChannelInput {
  channelId: string;
  name: string;
  description?: string;
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
  occurredAt?: string;
}

export interface GetMessagesInput {
  channelId: string;
  after?: string;
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
  actorId: string;
  status?: "backlog" | "todo" | "in_progress" | "in_review" | "done";
  assigneeId?: string | null;
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

export interface DeleteIssueInput {
  issueId: string;
  actorId: string;
}

export interface CreateIssueCommentInput {
  issueId: string;
  actorId: string;
  actorType: "user" | "agent" | "system";
  message: string;
  occurredAt?: string;
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

export type ResourcePermission = "read" | "write" | "admin";
export type ResourceType = "runtime" | "agent" | "channel";

export interface WorkspacePermission {
  id: string;
  organizationId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: ResourcePermission;
  createdAt: string;
  createdBy: string;
}

export interface WorkspaceInvitation {
  id: string;
  organizationId: string;
  email: string;
  role: MembershipRole;
  invitedBy: string;
  token: string;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export interface CreateWorkspaceInvitationInput {
  organizationId: string;
  email: string;
  role: MembershipRole;
  invitedBy: string;
  ttlMs?: number;
}

export interface GrantPermissionInput {
  organizationId: string;
  userId: string;
  resourceType: ResourceType;
  resourceId: string;
  permission: ResourcePermission;
  grantedBy: string;
}

export interface RevokePermissionInput {
  permissionId: string;
}

export interface ControlPlaneStorage {
  getDemoSession(): Promise<AuthSession>;
  getWorkspacesForUser(userId: string): Promise<Array<{ id: string; name: string; slug: string }>>;
  createWorkspace(input: CreateWorkspaceInput): Promise<{ id: string; name: string; slug: string }>;
  getOrganization(orgId: string): Promise<{ id: string } | null>;
  getChannel(channelId: string): Promise<ChannelSummary | null>;
  getChannels(orgId: string): Promise<ChannelSummary[]>;
  createChannel(input: CreateChannelInput): Promise<ChannelSummary>;
  getMessages(input: GetMessagesInput): Promise<MessageDTO[]>;
  getRuntimes(orgId: string): Promise<RuntimeIdentity[]>;
  getAgents(orgId: string): Promise<AgentIdentity[]>;
  getWorkspaceBootstrap(orgId: string): Promise<WorkspaceBootstrapPayload>;
  getWorkspaceBootstrapForRuntime(runtimeId: string): Promise<WorkspaceBootstrapPayload>;
  getWorkspaceBootstrapForChannel(channelId: string): Promise<WorkspaceBootstrapPayload>;
  getAgentIdsForRuntime(runtimeId: string): Promise<string[]>;
  getAgentsForChannel(channelId: string): Promise<AgentIdentity[]>;
  getAgentActivitiesForAgents(agentIds: string[]): Promise<AgentActivityDTO[]>;
  getAgentRunLogsForChannel(channelId: string, after?: string): Promise<AgentRunLogDTO[]>;
  createRuntimeRegistrationCommand(input: CreateRuntimeRegistrationCommandInput): Promise<RuntimeRegistrationCommand>;
  getWorkspacePermissions(orgId: string, userId?: string): Promise<WorkspacePermission[]>;
  grantPermission(input: GrantPermissionInput): Promise<WorkspacePermission>;
  revokePermission(input: RevokePermissionInput): Promise<void>;
  getWorkspaceInvitations(orgId: string): Promise<WorkspaceInvitation[]>;
  createWorkspaceInvitation(input: CreateWorkspaceInvitationInput): Promise<WorkspaceInvitation>;
  acceptWorkspaceInvitation(token: string, userId: string): Promise<void>;
  getOrganizationMembers(orgId: string): Promise<Array<{ userId: string; email: string; role: MembershipRole }>>;
  getChannelParticipants(channelId: string): Promise<ChannelParticipantDTO[]>;
  updateChannel(input: UpdateChannelInput): Promise<ChannelSummary>;
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
  deleteIssue(input: DeleteIssueInput): Promise<{ issueId: string }>;
  createIssueComment(input: CreateIssueCommentInput): Promise<IssueActivityDTO>;
  getIssueActivities(issueId: string): Promise<IssueActivityDTO[]>;
  createIssueFromMessage(input: CreateIssueFromMessageInput): Promise<IssueDTO>;
  createIssueFromMessages(input: CreateIssueFromMessagesInput): Promise<IssueDTO>;
  pullRuntimeIssues(input: PullRuntimeIssuesInput): Promise<RuntimeIssueClaimDTO[]>;
  pullRuntimeAgentMessages(input: PullRuntimeAgentMessagesInput): Promise<RuntimeAgentMessageClaimDTO[]>;
  recordAgentRunLog(input: AgentRunLogEventPayload): Promise<{
    log: AgentRunLogDTO;
  }>;
  syncAgentWorkspaceFiles(input: {
    agentId: string;
    files: AgentWorkspaceFileContentDTO[];
  }): Promise<{
    files: AgentWorkspaceFileSummaryDTO[];
  }>;
  listAgentWorkspaceFiles(agentId: string): Promise<AgentWorkspaceFileSummaryDTO[]>;
  getAgentWorkspaceFile(agentId: string, path: string): Promise<AgentWorkspaceFileContentDTO | null>;
  recordAgentActivity(input: AgentActivityEventPayload): Promise<{
    activity: AgentActivityDTO;
  }>;
  recordAgentIssueEvent(input: AgentIssueEventPayload): Promise<{
    issue: IssueDTO;
    message: MessageDTO | null;
  }>;
  recordAgentMessageResponse(input: AgentMessageResponsePayload): Promise<{
    message: MessageDTO;
  }>;
  getPendingAgentResponses(agentId: string): Promise<PendingAgentResponse[]>;
  claimAgentResponse(responseId: string, agentId: string): Promise<PendingAgentResponse>;
  completeAgentResponse(responseId: string): Promise<void>;
}

import type {
  AgentControlAction,
  AgentControlActionType,
  AgentLifecycleState,
  AgentProfile,
  IssueActivityDTO,
  IssueDTO,
  RuntimeIssueClaim,
  AgentReasoningEffort,
  AgentRestartMode,
  IssueStatus,
  MessageDTO,
  RuntimeDaemon,
} from "./domain/workspace";

export interface AuthSession {
  userId: string;
  organizationId: string;
  email: string;
  role: "owner" | "admin" | "member";
}

export interface RuntimeIdentity {
  id: string;
  name: string;
  status: RuntimeDaemon["status"];
  lastHeartbeatAt?: string | null;
}

export type AgentActivityStatus = "idle" | "running";

export interface AgentActivityDTO {
  agentId: string;
  status: AgentActivityStatus;
  summary: string;
  detail: string | null;
  updatedAt: string;
}

export interface AgentIdentity {
  id: string;
  runtimeId: string;
  channelId: string;
  name: string;
  description: AgentProfile["description"];
  implementation: AgentProfile["implementation"];
  model: AgentProfile["model"];
  reasoningEffort: AgentReasoningEffort;
  status: AgentLifecycleState;
}

export interface ChannelSummary {
  id: string;
  type: "group" | "direct";
  name: string;
  description?: string | null;
  unreadCount?: number;
}

export interface ChannelParticipantDTO {
  participantId: string;
  participantType: "user" | "agent";
  displayName: string;
  email?: string | null;
  role?: AuthSession["role"] | null;
  agentStatus?: AgentLifecycleState | null;
}

export interface RuntimeRegistrationCommand {
  token: string;
  expiresAt: string;
  controlPlaneUrl: string;
  installCommand: string;
}

export interface RuntimeHeartbeatPayload {
  runtimeId: string;
  occurredAt?: string;
}

export interface AgentIssueEventPayload {
  agentId: string;
  issueId: string;
  status: IssueStatus;
  message?: string;
  occurredAt?: string;
}

export interface AgentActivityEventPayload {
  agentId: string;
  status: AgentActivityStatus;
  summary: string;
  detail?: string;
  occurredAt?: string;
}

export interface AgentControlRequest {
  action: AgentControlActionType;
  restartMode?: AgentRestartMode;
  occurredAt?: string;
}

export interface AgentControlActionDTO {
  id: AgentControlAction["id"];
  runtimeId: AgentControlAction["runtimeId"];
  agentId: AgentControlAction["agentId"];
  action: AgentControlAction["action"];
  restartMode: AgentControlAction["restartMode"];
  requestedAt: AgentControlAction["requestedAt"];
  acknowledgedAt: AgentControlAction["acknowledgedAt"];
}

export interface RuntimeIssueClaimDTO {
  issue: IssueDTO;
  agent: AgentIdentity;
  sourceMessages: MessageDTO[];
  issueActivities: IssueActivityDTO[];
}

export interface RuntimeAgentMessageClaimDTO {
  agent: AgentIdentity;
  sourceMessage: MessageDTO;
  isFirstUserMessage: boolean;
}

export interface AgentMessageResponsePayload {
  agentId: string;
  sourceMessageId: string;
  content: string;
  occurredAt?: string;
}

export type AgentRunLogKind = "direct_message" | "issue";

export interface AgentRunLogDTO {
  id: string;
  agentId: string;
  runtimeId: string;
  channelId: string | null;
  issueId: string | null;
  sessionId: string;
  kind: AgentRunLogKind;
  prompt: string;
  response: string;
  createdAt: string;
}

export interface AgentRunLogEventPayload {
  agentId: string;
  runtimeId: string;
  channelId?: string | null;
  issueId?: string | null;
  sessionId: string;
  kind: AgentRunLogKind;
  prompt: string;
  response: string;
  occurredAt?: string;
}

export interface AgentWorkspaceFileSummaryDTO {
  path: string;
  kind: "file";
  size: number;
  updatedAt: string;
}

export interface AgentWorkspaceFileContentDTO extends AgentWorkspaceFileSummaryDTO {
  content: string;
}

export interface WorkspaceBootstrapPayload {
  organization: {
    id: string;
  } | null;
  channels: ChannelSummary[];
  runtimes: RuntimeIdentity[];
  agents: AgentIdentity[];
  agentActivities: AgentActivityDTO[];
  agentRunLogs: AgentRunLogDTO[];
  messages: MessageDTO[];
  issues: IssueDTO[];
  issueActivities: IssueActivityDTO[];
}

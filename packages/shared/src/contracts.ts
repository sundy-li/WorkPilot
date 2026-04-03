import type {
  AgentControlAction,
  AgentControlActionType,
  AgentLifecycleState,
  AgentProfile,
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
  unreadCount?: number;
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
}

export interface RuntimeAgentMessageClaimDTO {
  agent: AgentIdentity;
  sourceMessage: MessageDTO;
}

export interface AgentMessageResponsePayload {
  agentId: string;
  sourceMessageId: string;
  content: string;
  occurredAt?: string;
}

export interface WorkspaceBootstrapPayload {
  organization: {
    id: string;
  } | null;
  channels: ChannelSummary[];
  runtimes: RuntimeIdentity[];
  agents: AgentIdentity[];
  messages: MessageDTO[];
  issues: IssueDTO[];
}

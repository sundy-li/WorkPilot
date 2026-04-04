import type {
  AgentActivityEventPayload,
  AgentControlActionDTO,
  AgentIssueEventPayload,
  AgentMessageResponsePayload,
  RuntimeAgentMessageClaimDTO,
  RuntimeIssueClaimDTO,
  WorkspaceBootstrapPayload
} from "@workpilot/shared";

export type DaemonFetcher = (request: Request) => Promise<Response> | Response;

export interface DaemonFetchContext {
  controlPlaneUrl: string;
  fetcher?: DaemonFetcher;
}

export interface RegisterRuntimeDaemonInput extends DaemonFetchContext {
  registrationToken: string;
  runtimeName: string;
  runtimeKey: string;
}

export interface SendRuntimeHeartbeatInput extends DaemonFetchContext {
  runtimeId: string;
  occurredAt?: string;
}

export type GetWorkspaceBootstrapInput = DaemonFetchContext;

export interface GetRuntimeControlActionsInput extends DaemonFetchContext {
  runtimeId: string;
}

export interface AcknowledgeAgentControlActionInput extends DaemonFetchContext {
  actionId: string;
  occurredAt?: string;
}

export interface PullRuntimeIssuesInput extends DaemonFetchContext {
  runtimeId: string;
  limit?: number;
  occurredAt?: string;
}

export interface PullRuntimeAgentMessagesInput extends DaemonFetchContext {
  runtimeId: string;
  limit?: number;
  occurredAt?: string;
}

export interface RegisteredRuntimeDaemon {
  runtime: {
    id: string;
    name: string;
    status: string;
  };
  credential: {
    token: string;
  };
}

export interface RuntimeHeartbeatResponse {
  runtime: {
    id: string;
    status: string;
    lastHeartbeatAt: string | null;
  };
}

export interface RuntimeControlActionsResponse {
  actions: AgentControlActionDTO[];
}

export interface AcknowledgedAgentControlActionResponse {
  action: AgentControlActionDTO;
}

export interface RuntimeIssueClaimsResponse {
  claims: RuntimeIssueClaimDTO[];
}

export interface RuntimeAgentMessageClaimsResponse {
  claims: RuntimeAgentMessageClaimDTO[];
}

export interface AgentIssueEventResponse {
  issue: RuntimeIssueClaimDTO["issue"];
  message: RuntimeIssueClaimDTO["sourceMessages"][number] | null;
}

export interface AgentMessageEventResponse {
  message: RuntimeAgentMessageClaimDTO["sourceMessage"];
}

export interface AgentActivityEventResponse {
  activity: {
    agentId: string;
    status: "idle" | "running";
    summary: string;
    detail: string | null;
    updatedAt: string;
  };
}

export async function registerRuntimeDaemon(input: RegisterRuntimeDaemonInput): Promise<RegisteredRuntimeDaemon> {
  return requestJson<RegisteredRuntimeDaemon>(input, "/runtime/register", {
    method: "POST",
    body: JSON.stringify({
      registrationToken: input.registrationToken,
      runtimeName: input.runtimeName,
      runtimeKey: input.runtimeKey
    })
  });
}

export async function sendRuntimeHeartbeat(input: SendRuntimeHeartbeatInput): Promise<RuntimeHeartbeatResponse> {
  return requestJson<RuntimeHeartbeatResponse>(input, "/runtime/heartbeat", {
    method: "POST",
    body: JSON.stringify({
      runtimeId: input.runtimeId,
      occurredAt: input.occurredAt
    })
  });
}

export async function getWorkspaceBootstrap(
  input: GetWorkspaceBootstrapInput
): Promise<WorkspaceBootstrapPayload> {
  return requestJson<WorkspaceBootstrapPayload>(input, "/bootstrap/workspace", {
    method: "GET"
  });
}

export async function getRuntimeControlActions(
  input: GetRuntimeControlActionsInput
): Promise<RuntimeControlActionsResponse> {
  return requestJson<RuntimeControlActionsResponse>(input, `/runtimes/${input.runtimeId}/control-actions`, {
    method: "GET"
  });
}

export async function acknowledgeAgentControlAction(
  input: AcknowledgeAgentControlActionInput
): Promise<AcknowledgedAgentControlActionResponse> {
  return requestJson<AcknowledgedAgentControlActionResponse>(input, `/control-actions/${input.actionId}/ack`, {
    method: "POST",
    body: JSON.stringify({
      occurredAt: input.occurredAt
    })
  });
}

export async function pullRuntimeIssues(input: PullRuntimeIssuesInput): Promise<RuntimeIssueClaimsResponse> {
  return requestJson<RuntimeIssueClaimsResponse>(input, "/runtime/issues/pull", {
    method: "POST",
    body: JSON.stringify({
      runtimeId: input.runtimeId,
      limit: input.limit,
      occurredAt: input.occurredAt
    })
  });
}

export async function pullRuntimeAgentMessages(
  input: PullRuntimeAgentMessagesInput
): Promise<RuntimeAgentMessageClaimsResponse> {
  return requestJson<RuntimeAgentMessageClaimsResponse>(input, "/runtime/messages/pull", {
    method: "POST",
    body: JSON.stringify({
      runtimeId: input.runtimeId,
      limit: input.limit,
      occurredAt: input.occurredAt
    })
  });
}

export async function recordAgentIssueEvent(input: DaemonFetchContext & AgentIssueEventPayload): Promise<AgentIssueEventResponse> {
  return requestJson<AgentIssueEventResponse>(input, "/agent/issue-events", {
    method: "POST",
    body: JSON.stringify({
      agentId: input.agentId,
      issueId: input.issueId,
      status: input.status,
      message: input.message,
      occurredAt: input.occurredAt
    })
  });
}

export async function recordAgentActivity(
  input: DaemonFetchContext & AgentActivityEventPayload
): Promise<AgentActivityEventResponse> {
  return requestJson<AgentActivityEventResponse>(input, "/agent/activity-events", {
    method: "POST",
    body: JSON.stringify({
      agentId: input.agentId,
      status: input.status,
      summary: input.summary,
      detail: input.detail,
      occurredAt: input.occurredAt
    })
  });
}

export async function recordAgentMessageResponse(
  input: DaemonFetchContext & AgentMessageResponsePayload
): Promise<AgentMessageEventResponse> {
  return requestJson<AgentMessageEventResponse>(input, "/agent/message-events", {
    method: "POST",
    body: JSON.stringify({
      agentId: input.agentId,
      sourceMessageId: input.sourceMessageId,
      content: input.content,
      occurredAt: input.occurredAt
    })
  });
}

async function requestJson<T>(input: DaemonFetchContext, path: string, init: RequestInit): Promise<T> {
  const fetcher = input.fetcher ?? fetch;
  const request = new Request(new URL(path, input.controlPlaneUrl), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const response = await fetcher(request);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Control-plane request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

import type {
  AgentControlRequest,
  AuthSession,
  ChannelSummary,
  IssueDTO,
  MessageDTO,
  RuntimeRegistrationCommand,
  WorkspaceBootstrapPayload
} from "@workpilot/shared";

export type ApiFetcher = (request: Request) => Promise<Response> | Response;

interface CreateWorkPilotApiClientOptions {
  baseUrl: string;
  fetcher?: ApiFetcher;
}

interface LoginInput {
  email: string;
  password: string;
}

interface RegisterInput {
  email: string;
}

interface SendMessageInput {
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

interface CreateChannelInput {
  organizationId: string;
  name: string;
}

interface CreateIssueFromMessageInput {
  messageId: string;
  actorId: string;
  assigneeId: string | null;
  title: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

interface CreateIssueFromMessagesInput {
  messageIds: string[];
  actorId: string;
  assigneeId: string | null;
  title: string;
  description: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

interface CreateIssueInput {
  actorId: string;
  title: string;
  description: string;
  status?: IssueDTO["status"];
  assigneeId: string | null;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
  sourceChannelId?: string | null;
}

interface UpdateIssueInput {
  issueId: string;
  status?: IssueDTO["status"];
  assigneeId?: string | null;
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

interface CreateAgentInput {
  runtimeId: string;
  name: string;
  description: string;
  implementation: "claude" | "codex" | "opencode" | "pi";
  model: string;
  reasoningEffort: "low" | "medium" | "high";
}

interface DeleteRuntimeInput {
  runtimeId: string;
  actorId: string;
}

interface ControlAgentInput extends AgentControlRequest {
  agentId: string;
}

interface EnsureAgentDirectChannelInput {
  agentId: string;
  userId: string;
}

export function createWorkPilotApiClient(options: CreateWorkPilotApiClientOptions) {
  return {
    async login(input: LoginInput) {
      return requestJson<{ session: AuthSession }>(options, "/auth/login", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async register(input: RegisterInput) {
      return requestJson<{ user: { id: string; email: string; organizationId: string } }>(options, "/auth/register", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async getMe() {
      return requestJson<{ session: AuthSession }>(options, "/me");
    },
    async getWorkspaceBootstrap() {
      return requestJson<WorkspaceBootstrapPayload>(options, "/bootstrap/workspace");
    },
    async getRuntimes(orgId: string) {
      return requestJson<{ runtimes: WorkspaceBootstrapPayload["runtimes"] }>(options, `/organizations/${orgId}/runtimes`);
    },
    async createChannel(input: CreateChannelInput) {
      return requestJson<{ channel: ChannelSummary }>(options, `/organizations/${input.organizationId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: input.name
        })
      });
    },
    async sendMessage(input: SendMessageInput) {
      return requestJson<{ message: MessageDTO }>(options, `/channels/${input.channelId}/messages`, {
        method: "POST",
        body: JSON.stringify({
          channelId: input.channelId,
          content: input.content,
          attachments: input.attachments ?? [],
          senderId: input.senderId,
          senderType: input.senderType
        })
      });
    },
    async createIssue(input: CreateIssueInput) {
      return requestJson<{ issue: IssueDTO }>(options, "/issues", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async updateIssue(input: UpdateIssueInput) {
      return requestJson<{ issue: IssueDTO }>(options, `/issues/${input.issueId}`, {
        method: "PATCH",
        body: JSON.stringify({
          status: input.status,
          assigneeId: input.assigneeId,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          project: input.project
        })
      });
    },
    async createIssueFromMessage(input: CreateIssueFromMessageInput) {
      return requestJson<{ issue: IssueDTO }>(options, `/messages/${input.messageId}/issues`, {
        method: "POST",
        body: JSON.stringify({
          actorId: input.actorId,
          assigneeId: input.assigneeId,
          title: input.title,
          description: input.description ?? "",
          priority: input.priority ?? "medium",
          dueDate: input.dueDate ?? null,
          project: input.project ?? null
        })
      });
    },
    async createIssueFromMessages(input: CreateIssueFromMessagesInput) {
      return requestJson<{ issue: IssueDTO }>(options, "/issues/from-messages", {
        method: "POST",
        body: JSON.stringify({
          actorId: input.actorId,
          assigneeId: input.assigneeId,
          messageIds: input.messageIds,
          title: input.title,
          description: input.description,
          priority: input.priority ?? "medium",
          dueDate: input.dueDate ?? null,
          project: input.project ?? null
        })
      });
    },
    async createRuntimeRegistrationCommand(organizationId: string, actorId: string, actorRole: "owner" | "admin") {
      return requestJson<RuntimeRegistrationCommand>(options, `/organizations/${organizationId}/runtime-registration-tokens`, {
        method: "POST",
        body: JSON.stringify({
          actorId,
          actorRole
        })
      });
    },
    async createAgent(input: CreateAgentInput) {
      return requestJson<{ agent: WorkspaceBootstrapPayload["agents"][number] }>(
        options,
        `/runtimes/${input.runtimeId}/agents`,
        {
          method: "POST",
          body: JSON.stringify({
            name: input.name,
            description: input.description,
            implementation: input.implementation,
            model: input.model,
            reasoningEffort: input.reasoningEffort
          })
        }
      );
    },
    async ensureAgentDirectChannel(input: EnsureAgentDirectChannelInput) {
      return requestJson<{ channel: ChannelSummary }>(options, `/agents/${input.agentId}/direct-channel`, {
        method: "POST",
        body: JSON.stringify({
          userId: input.userId
        })
      });
    },
    async deleteRuntime(input: DeleteRuntimeInput) {
      return requestJson<{
        runtime: WorkspaceBootstrapPayload["runtimes"][number] | null;
      }>(options, `/runtimes/${input.runtimeId}`, {
        method: "DELETE",
        body: JSON.stringify({
          actorId: input.actorId
        })
      });
    },
    async controlAgent(input: ControlAgentInput) {
      return requestJson<{
        agent: WorkspaceBootstrapPayload["agents"][number] | null;
        controlAction: {
          id: string;
          runtimeId: string;
          agentId: string;
          action: string;
          restartMode: string | null;
          requestedAt: string;
          acknowledgedAt: string | null;
        } | null;
      }>(options, `/agents/${input.agentId}/control`, {
        method: "POST",
        body: JSON.stringify({
          action: input.action,
          restartMode: input.restartMode,
          occurredAt: input.occurredAt
        })
      });
    }
  };
}

async function requestJson<T>(
  options: CreateWorkPilotApiClientOptions,
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const fetcher = options.fetcher ?? fetch;
  const request = new Request(new URL(path, options.baseUrl), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init.headers ?? {})
    }
  });
  const response = await fetcher(request);

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(payload?.error ?? `Request failed with status ${response.status}.`);
  }

  return (await response.json()) as T;
}

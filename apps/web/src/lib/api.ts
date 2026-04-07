import type {
  AgentActivityDTO,
  AgentControlRequest,
  AgentRunLogDTO,
  AgentWorkspaceFileContentDTO,
  AgentWorkspaceFileSummaryDTO,
  AuthSession,
  ChannelParticipantDTO,
  ChannelSummary,
  IssueActivityDTO,
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
  occurredAt?: string;
}

interface CreateChannelInput {
  organizationId: string;
  name: string;
  description?: string;
  actorId?: string;
  members?: Array<{
    participantId: string;
    participantType: "user" | "agent";
  }>;
}

interface UpdateChannelInput {
  channelId: string;
  name: string;
  description?: string;
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
  actorId: string;
  status?: IssueDTO["status"];
  assigneeId?: string | null;
  title?: string;
  description?: string;
  priority?: "low" | "medium" | "high";
  dueDate?: string | null;
  project?: string | null;
}

interface DeleteIssueInput {
  issueId: string;
  actorId: string;
}

interface CreateIssueCommentInput {
  issueId: string;
  actorId: string;
  actorType?: "user" | "agent" | "system";
  message: string;
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
    async getWorkspaces(userId: string) {
      return requestJson<{ workspaces: Array<{ id: string; name: string; slug: string }> }>(
        options,
        `/workspaces?userId=${encodeURIComponent(userId)}`
      );
    },
    async createWorkspace(input: { userId: string; name: string; description?: string }) {
      return requestJson<{ workspace: { id: string; name: string; slug: string } }>(options, "/workspaces", {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async getWorkspaceBootstrap(organizationId: string) {
      return requestJson<WorkspaceBootstrapPayload>(options, `/bootstrap/workspace?organizationId=${encodeURIComponent(organizationId)}`);
    },
    async getChannelMessages(channelId: string, input?: { after?: string; organizationId?: string }) {
      const params = new URLSearchParams();
      if (input?.after) {
        params.set("after", input.after);
      }
      if (input?.organizationId) {
        params.set("organizationId", input.organizationId);
      }
      const search = params.toString() ? `?${params.toString()}` : "";
      return requestJson<{ messages: MessageDTO[]; agentActivities: AgentActivityDTO[]; agentRunLogs: AgentRunLogDTO[] }>(
        options,
        `/channels/${channelId}/messages${search}`
      );
    },
    async getRuntimes(orgId: string) {
      return requestJson<{ runtimes: WorkspaceBootstrapPayload["runtimes"] }>(options, `/organizations/${orgId}/runtimes`);
    },
    async createChannel(input: CreateChannelInput) {
      return requestJson<{ channel: ChannelSummary }>(options, `/organizations/${input.organizationId}/channels`, {
        method: "POST",
        body: JSON.stringify({
          name: input.name,
          description: input.description,
          actorId: input.actorId,
          members: input.members ?? []
        })
      });
    },
    async getChannelParticipants(channelId: string) {
      return requestJson<{ participants: ChannelParticipantDTO[] }>(options, `/channels/${channelId}/participants`);
    },
    async updateChannel(input: UpdateChannelInput) {
      return requestJson<{ channel: ChannelSummary }>(options, `/channels/${input.channelId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: input.name,
          description: input.description
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
          senderType: input.senderType,
          occurredAt: input.occurredAt
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
          actorId: input.actorId,
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
    async getIssueActivities(issueId: string) {
      return requestJson<{ activities: IssueActivityDTO[] }>(options, `/issues/${issueId}/activities`);
    },
    async deleteIssue(input: DeleteIssueInput) {
      return requestJson<{ issueId: string }>(options, `/issues/${input.issueId}`, {
        method: "DELETE",
        body: JSON.stringify({
          actorId: input.actorId
        })
      });
    },
    async createIssueComment(input: CreateIssueCommentInput) {
      return requestJson<{ activity: IssueActivityDTO }>(options, `/issues/${input.issueId}/comments`, {
        method: "POST",
        body: JSON.stringify({
          actorId: input.actorId,
          actorType: input.actorType ?? "user",
          message: input.message
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
    },
    async getWorkspacePermissions(orgId: string, userId?: string) {
      const search = new URLSearchParams();
      if (userId) search.set("userId", userId);
      const query = search.toString() ? `?${search.toString()}` : "";
      return requestJson<{ permissions: Array<{
        id: string;
        organizationId: string;
        userId: string;
        resourceType: "runtime" | "agent" | "channel";
        resourceId: string;
        permission: "read" | "write" | "admin";
        createdAt: string;
        createdBy: string;
      }> }>(options, `/organizations/${orgId}/permissions${query}`);
    },
    async grantPermission(input: {
      organizationId: string;
      userId: string;
      resourceType: "runtime" | "agent" | "channel";
      resourceId: string;
      permission: "read" | "write" | "admin";
      grantedBy: string;
    }) {
      return requestJson<{ permission: {
        id: string;
        organizationId: string;
        userId: string;
        resourceType: "runtime" | "agent" | "channel";
        resourceId: string;
        permission: "read" | "write" | "admin";
        createdAt: string;
        createdBy: string;
      } }>(options, `/organizations/${input.organizationId}/permissions`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async revokePermission(permissionId: string) {
      return requestJson<{ ok: boolean }>(options, `/permissions/${permissionId}`, {
        method: "DELETE"
      });
    },
    async getWorkspaceInvitations(orgId: string) {
      return requestJson<{ invitations: Array<{
        id: string;
        organizationId: string;
        email: string;
        role: "owner" | "admin" | "member";
        invitedBy: string;
        token: string;
        expiresAt: string;
        acceptedAt: string | null;
        createdAt: string;
      }> }>(options, `/organizations/${orgId}/invitations`);
    },
    async createWorkspaceInvitation(input: {
      organizationId: string;
      email: string;
      role: "owner" | "admin" | "member";
      invitedBy: string;
    }) {
      return requestJson<{ invitation: {
        id: string;
        organizationId: string;
        email: string;
        role: "owner" | "admin" | "member";
        invitedBy: string;
        token: string;
        expiresAt: string;
        acceptedAt: string | null;
        createdAt: string;
      } }>(options, `/organizations/${input.organizationId}/invitations`, {
        method: "POST",
        body: JSON.stringify(input)
      });
    },
    async acceptWorkspaceInvitation(token: string, userId: string) {
      return requestJson<{ ok: boolean }>(options, `/invitations/${token}/accept`, {
        method: "POST",
        body: JSON.stringify({ userId })
      });
    },
    async getOrganizationMembers(orgId: string) {
      return requestJson<{ members: Array<{
        userId: string;
        email: string;
        role: "owner" | "admin" | "member";
      }> }>(options, `/organizations/${orgId}/members`);
    },
    async listAgentWorkspaceFiles(agentId: string) {
      return requestJson<{ files: AgentWorkspaceFileSummaryDTO[] }>(options, `/agents/${agentId}/workspace-files`);
    },
    async getAgentWorkspaceFileContent(agentId: string, path: string) {
      return requestJson<{ file: AgentWorkspaceFileContentDTO }>(
        options,
        `/agents/${agentId}/workspace-files/content?path=${encodeURIComponent(path)}`
      );
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

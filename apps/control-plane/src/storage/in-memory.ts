import {
  acknowledgeAgentControlAction,
  claimRuntimeAgentMessages,
  claimRuntimeIssues,
  createAgentProfile,
  createIssue,
  createIssueFromMessage,
  createIssueFromMessages,
  createMessage,
  createRuntimeRegistrationToken,
  createWorkspaceSnapshot,
  queueAgentControlAction,
  softDeleteRuntimeDaemon,
  recordAgentMessageResponse,
  recordAgentIssueEvent,
  recordRuntimeHeartbeat,
  registerRuntimeDaemon,
  type AuthSession,
  type ChannelSummary,
  type MembershipRole,
  type WorkspaceBootstrapPayload,
  type WorkspaceSnapshot
} from "@workpilot/shared";
import type {
  ControlPlaneStorage,
  CreateAgentInput,
  CreateIssueFromMessagesInput,
  CreateIssueFromMessageInput,
  CreateIssueInput,
  CreateMessageInput,
  CreateRuntimeRegistrationCommandInput,
  RecordRuntimeHeartbeatInput,
  RegisterRuntimeInput
} from "./types";

export function createInMemoryControlPlaneStorage(): ControlPlaneStorage {
  const workspaces = createSeedState();
  const channelsByOrganization = createSeedChannels();
  const demoSession: AuthSession = {
    userId: "usr_admin",
    organizationId: "org_demo",
    email: "admin@workpilot.local",
    role: "admin"
  };

  return {
    async getDemoSession() {
      return demoSession;
    },
    async getOrganization(orgId) {
      const workspace = workspaces.get(orgId);
      return workspace?.organization ?? null;
    },
    async getChannel(channelId) {
      return findChannelById(channelsByOrganization, channelId) ?? null;
    },
    async getChannels(orgId) {
      return channelsByOrganization.get(orgId) ?? [];
    },
    async createChannel(input) {
      const workspace = requireWorkspace(workspaces, input.organizationId);
      const channels = channelsByOrganization.get(input.organizationId) ?? [];
      const channel = createGroupChannel(channels, input.name);

      channelsByOrganization.set(workspace.organization.id, [...channels, channel]);
      return channel;
    },
    async getMessages(channelId) {
      const workspace = findWorkspaceByChannel(workspaces, channelsByOrganization, channelId);
      return workspace?.messages
        .filter((message) => message.channelId === channelId)
        .map((message) => ({
          id: message.id,
          channelId: message.channelId,
          content: message.content,
          attachments: message.attachments,
          senderId: message.senderId,
          senderType: message.senderType,
          createdAt: message.createdAt
        })) ?? [];
    },
    async getRuntimes(orgId) {
      const workspace = workspaces.get(orgId);
      return (
        workspace?.runtimes.map((runtime) => ({
          id: runtime.id,
          name: runtime.name,
          status: runtime.status
        })) ?? []
      );
    },
    async getAgents(orgId) {
      const workspace = workspaces.get(orgId);
      return (
        workspace?.agents.map((agent) => ({
          id: agent.id,
          runtimeId: agent.runtimeId,
          channelId: agent.channelId,
          name: agent.name,
          description: agent.description,
          implementation: agent.implementation,
          model: agent.model,
          reasoningEffort: agent.reasoningEffort,
          status: agent.status
        })) ?? []
      );
    },
    async getWorkspaceBootstrap(orgId) {
      const workspace = workspaces.get(orgId);
      return toBootstrapPayload(workspace, channelsByOrganization.get(orgId) ?? []);
    },
    async createRuntimeRegistrationCommand(input: CreateRuntimeRegistrationCommandInput) {
      const workspace = requireWorkspace(workspaces, input.organizationId);
      const token = createRuntimeRegistrationToken(workspace, {
        actorId: input.actorId,
        actorRole: input.actorRole
      });

      return {
        token: token.token,
        expiresAt: token.expiresAt,
        controlPlaneUrl: input.controlPlaneUrl,
        installCommand: [
          "bun run --cwd apps/agent-daemon start --",
          `--control-plane-url ${input.controlPlaneUrl}`,
          `--registration-token ${token.token}`
        ].join(" ")
      };
    },
    async registerRuntime(input: RegisterRuntimeInput) {
      const workspace = findWorkspaceByRegistrationToken(workspaces, input.registrationToken);
      if (!workspace) {
        throw new Error("Registration token is invalid.");
      }
      const runtime = registerRuntimeDaemon(workspace, input);
      return {
        id: runtime.id,
        name: runtime.name,
        status: runtime.status,
        credentialId: runtime.credentialId,
        lastHeartbeatAt: runtime.lastHeartbeatAt
      };
    },
    async recordRuntimeHeartbeat(input: RecordRuntimeHeartbeatInput) {
      const workspace = findWorkspaceByRuntimeId(workspaces, input.runtimeId);
      if (!workspace) {
        throw new Error("Runtime daemon was not found.");
      }
      const runtime = recordRuntimeHeartbeat(workspace, input);
      return {
        id: runtime.id,
        status: runtime.status,
        lastHeartbeatAt: runtime.lastHeartbeatAt
      };
    },
    async deleteRuntime(input) {
      const workspace = findWorkspaceByRuntimeId(workspaces, input.runtimeId);
      if (!workspace) {
        throw new Error("Runtime daemon was not found.");
      }

      const runtime = softDeleteRuntimeDaemon(workspace, {
        runtimeId: input.runtimeId,
        actorId: input.actorId,
        now: input.occurredAt
      });

      return {
        runtime: {
          id: runtime.id,
          name: runtime.name,
          status: runtime.status
        }
      };
    },
    async createAgent(input: CreateAgentInput) {
      const workspace = findWorkspaceByRuntimeId(workspaces, input.runtimeId);
      if (!workspace) {
        throw new Error("Runtime daemon was not found.");
      }
      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      const channel = createDirectChannelForAgent(channels, input.name);
      channelsByOrganization.set(workspace.organization.id, [...channels, channel]);
      const agent = createAgentProfile(workspace, {
        ...input,
        channelId: channel.id
      });
      return {
        ...toAgentIdentity(agent)
      };
    },
    async controlAgent(input) {
      const workspace = findWorkspaceByAgentId(workspaces, input.agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      const controlAction = queueAgentControlAction(workspace, {
        agentId: input.agentId,
        action: input.action,
        restartMode: input.restartMode,
        now: input.occurredAt
      });
      const agent = workspace.agents.find((entry) => entry.id === input.agentId);

      return {
        agent: agent ? toAgentIdentity(agent) : null,
        controlAction: toControlActionDto(controlAction)
      };
    },
    async getRuntimeControlActions(runtimeId) {
      const workspace = findWorkspaceByRuntimeId(workspaces, runtimeId);
      if (!workspace) {
        return [];
      }

      return workspace.agentControlActions
        .filter((action) => action.runtimeId === runtimeId && !action.acknowledgedAt)
        .map((action) => toControlActionDto(action));
    },
    async acknowledgeAgentControlAction(input) {
      const workspace = findWorkspaceByControlActionId(workspaces, input.actionId);
      if (!workspace) {
        throw new Error("Agent control action was not found.");
      }

      return toControlActionDto(
        acknowledgeAgentControlAction(workspace, {
          actionId: input.actionId,
          now: input.occurredAt
        })
      );
    },
    async createMessage(input: CreateMessageInput) {
      const workspace = findWorkspaceByChannel(workspaces, channelsByOrganization, input.channelId);
      if (!workspace) {
        throw new Error("Channel not found.");
      }
      const message = createMessage(workspace, input);
      return {
        id: message.id,
        channelId: message.channelId,
        content: message.content,
        attachments: message.attachments,
        senderId: message.senderId,
        senderType: message.senderType,
        createdAt: message.createdAt
      };
    },
    async createIssue(input: CreateIssueInput) {
      const workspace = requireWorkspace(workspaces, demoSession.organizationId);
      return toIssueDto(createIssue(workspace, input));
    },
    async updateIssue(input) {
      const workspace = findWorkspaceByIssueId(workspaces, input.issueId);
      if (!workspace) {
        throw new Error("Issue was not found.");
      }

      const issue = workspace.issues.find((entry) => entry.id === input.issueId);
      if (!issue) {
        throw new Error("Issue was not found.");
      }

      issue.status = input.status ?? issue.status;
      issue.assigneeId = input.assigneeId === undefined ? issue.assigneeId : input.assigneeId;
      issue.title = input.title ?? issue.title;
      issue.description = input.description ?? issue.description;
      issue.priority = input.priority ?? issue.priority;
      issue.dueDate = input.dueDate === undefined ? issue.dueDate : input.dueDate;
      issue.project = input.project === undefined ? issue.project : input.project;
      issue.updatedAt = new Date().toISOString();

      return toIssueDto(issue);
    },
    async createIssueFromMessage(input: CreateIssueFromMessageInput) {
      const workspace = findWorkspaceByMessageId(workspaces, input.messageId);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }
      const issue = createIssueFromMessage(workspace, input);
      return toIssueDto(issue);
    },
    async createIssueFromMessages(input: CreateIssueFromMessagesInput) {
      const workspace = findWorkspaceByMessageIds(workspaces, input.messageIds);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }
      const issue = createIssueFromMessages(workspace, input);
      return toIssueDto(issue);
    },
    async pullRuntimeIssues(input) {
      const workspace = findWorkspaceByRuntimeId(workspaces, input.runtimeId);
      if (!workspace) {
        return [];
      }

      return claimRuntimeIssues(workspace, {
        runtimeId: input.runtimeId,
        limit: input.limit,
        now: input.occurredAt
      }).map((claim) => ({
        issue: toIssueDto(claim.issue),
        agent: toAgentIdentity(claim.agent),
        sourceMessages: claim.sourceMessages.map((message) => toMessageDto(message))
      }));
    },
    async recordAgentIssueEvent(input) {
      const workspace = findWorkspaceByIssueId(workspaces, input.issueId);
      if (!workspace) {
        throw new Error("Issue was not found.");
      }

      const result = recordAgentIssueEvent(workspace, input);

      return {
        issue: toIssueDto(result.issue),
        message: result.message ? toMessageDto(result.message) : null
      };
    },
    async pullRuntimeAgentMessages(input) {
      const workspace = findWorkspaceByRuntimeId(workspaces, input.runtimeId);
      if (!workspace) {
        return [];
      }

      return claimRuntimeAgentMessages(workspace, {
        runtimeId: input.runtimeId,
        limit: input.limit,
        now: input.occurredAt
      }).map((claim) => ({
        agent: toAgentIdentity(claim.agent),
        sourceMessage: toMessageDto(claim.sourceMessage)
      }));
    },
    async recordAgentMessageResponse(input) {
      const workspace = findWorkspaceByMessageId(workspaces, input.sourceMessageId);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }

      const message = recordAgentMessageResponse(workspace, input);

      return {
        message: toMessageDto(message)
      };
    }
  };
}

function toIssueDto(issue: WorkspaceSnapshot["issues"][number]) {
  return {
    id: issue.id,
    title: issue.title,
    description: issue.description,
    status: issue.status,
    assigneeId: issue.assigneeId,
    creatorId: issue.creatorId,
    priority: issue.priority,
    dueDate: issue.dueDate,
    project: issue.project,
    sourceChannelId: issue.sourceChannelId,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  };
}

function toMessageDto(message: WorkspaceSnapshot["messages"][number]) {
  return {
    id: message.id,
    channelId: message.channelId,
    content: message.content,
    attachments: message.attachments,
    senderId: message.senderId,
    senderType: message.senderType,
    createdAt: message.createdAt
  };
}

function toAgentIdentity(agent: WorkspaceSnapshot["agents"][number]) {
  return {
    id: agent.id,
    runtimeId: agent.runtimeId,
    channelId: agent.channelId,
    name: agent.name,
    description: agent.description,
    implementation: agent.implementation,
    model: agent.model,
    reasoningEffort: agent.reasoningEffort,
    status: agent.status
  };
}

function toControlActionDto(action: WorkspaceSnapshot["agentControlActions"][number]) {
  return {
    id: action.id,
    runtimeId: action.runtimeId,
    agentId: action.agentId,
    action: action.action,
    restartMode: action.restartMode,
    requestedAt: action.requestedAt,
    acknowledgedAt: action.acknowledgedAt
  };
}

function toBootstrapPayload(workspace: WorkspaceSnapshot | undefined, channels: ChannelSummary[]): WorkspaceBootstrapPayload {
  const visibleRuntimeIds = new Set(
    workspace?.runtimes.filter((runtime) => runtime.status !== "deleted").map((runtime) => runtime.id) ?? []
  );
  const visibleAgents =
    workspace?.agents.filter((agent) => agent.status !== "deleted" && visibleRuntimeIds.has(agent.runtimeId)) ?? [];
  const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id));
  const hiddenDirectChannelIds = new Set(
    (workspace?.agents ?? []).filter((agent) => !visibleAgentIds.has(agent.id)).map((agent) => agent.channelId)
  );
  const visibleChannels = channels.filter((channel) => !hiddenDirectChannelIds.has(channel.id));
  const visibleChannelIds = new Set(visibleChannels.map((channel) => channel.id));

  return {
    organization: workspace?.organization ?? null,
    channels: visibleChannels,
    runtimes:
      workspace?.runtimes
        .filter((runtime) => runtime.status !== "deleted")
        .map((runtime) => ({
          id: runtime.id,
          name: runtime.name,
          status: runtime.status
        })) ?? [],
    agents: visibleAgents.map((agent) => ({
      ...toAgentIdentity(agent)
    })),
    messages:
      workspace?.messages.filter((message) => visibleChannelIds.has(message.channelId)).map((message) => toMessageDto(message)) ?? [],
    issues: workspace?.issues.map((issue) => toIssueDto(issue)) ?? []
  };
}

function createSeedState(): Map<string, WorkspaceSnapshot> {
  const workspace = createWorkspaceSnapshot({
    organizationId: "org_demo"
  });

  workspace.runtimes.push({
    id: "rtm_seed",
    organizationId: workspace.organization.id,
    name: "Seed Runtime",
    runtimeKey: "runtime_seed",
    status: "online",
    credentialId: "cred_seed",
    registeredAt: "2025-01-01T00:00:00.000Z",
    lastHeartbeatAt: "2025-01-01T00:00:00.000Z"
  });

  workspace.agents.push({
    id: "agt_seed",
    organizationId: workspace.organization.id,
    runtimeId: "rtm_seed",
    channelId: "dir_admin_ops",
    name: "Ops Bot",
    description: "Monitor incidents, summarize impact, and propose next actions.",
    implementation: "claude",
    model: "claude-sonnet-4.5",
    reasoningEffort: "medium",
    status: "running",
    createdAt: "2025-01-01T00:00:00.000Z"
  });

  workspace.messages.push({
    id: "msg_seed",
    organizationId: workspace.organization.id,
    channelId: "chn_general",
    content: "Deployment health-check failed on production cluster.",
    attachments: [],
    senderId: "usr_admin",
    senderType: "user",
    createdAt: "2025-01-01T00:00:00.000Z"
  });

  return new Map([[workspace.organization.id, workspace]]);
}

function createSeedChannels(): Map<string, ChannelSummary[]> {
  return new Map([
    [
      "org_demo",
      [
        {
          id: "chn_general",
          type: "group",
          name: "all",
          unreadCount: 3
        },
        {
          id: "dir_admin_ops",
          type: "direct",
          name: "Ada x Ops Bot",
          unreadCount: 0
        }
      ]
    ]
  ]);
}

function requireWorkspace(workspaces: Map<string, WorkspaceSnapshot>, orgId: string): WorkspaceSnapshot {
  const workspace = workspaces.get(orgId);
  if (!workspace) {
    throw new Error("Organization not found.");
  }
  return workspace;
}

function findWorkspaceByRegistrationToken(
  workspaces: Map<string, WorkspaceSnapshot>,
  token: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.registrationTokens.some((entry) => entry.token === token)
  );
}

function findWorkspaceByRuntimeId(
  workspaces: Map<string, WorkspaceSnapshot>,
  runtimeId: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.runtimes.some((entry) => entry.id === runtimeId)
  );
}

function findWorkspaceByAgentId(
  workspaces: Map<string, WorkspaceSnapshot>,
  agentId: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.agents.some((entry) => entry.id === agentId)
  );
}

function findWorkspaceByControlActionId(
  workspaces: Map<string, WorkspaceSnapshot>,
  actionId: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.agentControlActions.some((entry) => entry.id === actionId)
  );
}

function findWorkspaceByMessageId(
  workspaces: Map<string, WorkspaceSnapshot>,
  messageId: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.messages.some((entry) => entry.id === messageId)
  );
}

function findWorkspaceByMessageIds(
  workspaces: Map<string, WorkspaceSnapshot>,
  messageIds: string[]
): WorkspaceSnapshot | undefined {
  if (messageIds.length === 0) {
    return undefined;
  }

  return Array.from(workspaces.values()).find((workspace) =>
    messageIds.every((messageId) => workspace.messages.some((entry) => entry.id === messageId))
  );
}

function findWorkspaceByIssueId(
  workspaces: Map<string, WorkspaceSnapshot>,
  issueId: string
): WorkspaceSnapshot | undefined {
  return Array.from(workspaces.values()).find((workspace) =>
    workspace.issues.some((entry) => entry.id === issueId)
  );
}

function findWorkspaceByChannel(
  workspaces: Map<string, WorkspaceSnapshot>,
  channelsByOrganization: Map<string, ChannelSummary[]>,
  channelId: string
): WorkspaceSnapshot | undefined {
  const organizationId = Array.from(channelsByOrganization.entries()).find(([, channels]) =>
    channels.some((channel) => channel.id === channelId)
  )?.[0];

  return organizationId ? workspaces.get(organizationId) : undefined;
}

function findChannelById(
  channelsByOrganization: Map<string, ChannelSummary[]>,
  channelId: string
): ChannelSummary | undefined {
  return Array.from(channelsByOrganization.values()).flat().find((channel) => channel.id === channelId);
}

function createDirectChannelForAgent(existingChannels: ChannelSummary[], agentName: string): ChannelSummary {
  const slug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  let id = `dir_admin_${slug || "agent"}`;
  let suffix = 1;

  while (existingChannels.some((channel) => channel.id === id)) {
    suffix += 1;
    id = `dir_admin_${slug || "agent"}_${suffix}`;
  }

  return {
    id,
    type: "direct",
    name: `Ada x ${agentName}`,
    unreadCount: 0
  };
}

function createGroupChannel(existingChannels: ChannelSummary[], rawName: string): ChannelSummary {
  const name = rawName.trim().toLowerCase();

  if (!name) {
    throw new Error("Channel name is required.");
  }

  const slug = name
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  let id = `chn_${slug || "channel"}`;
  let suffix = 1;

  while (existingChannels.some((channel) => channel.id === id)) {
    suffix += 1;
    id = `chn_${slug || "channel"}_${suffix}`;
  }

  return {
    id,
    type: "group",
    name,
    unreadCount: 0
  };
}

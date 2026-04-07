import {
  type AgentActivityDTO,
  appendIssueActivity,
  type AgentWorkspaceFileContentDTO,
  acknowledgeAgentControlAction,
  claimRuntimeIssues,
  createAgentProfile,
  createIssue,
  createIssueFromMessage,
  createIssueFromMessages,
  createMessage,
  createRuntimeRegistrationToken,
  createWorkspaceSnapshot,
  reconcileOfflineRuntimes,
  queueAgentControlAction,
  recordAgentRunLog,
  softDeleteRuntimeDaemon,
  recordAgentIssueEvent,
  type AgentRunLogDTO,
  recordRuntimeHeartbeat,
  registerRuntimeDaemon,
  type AuthSession,
  type ChannelParticipantDTO,
  type ChannelSummary,
  type IssueActivityDTO,
  type MembershipRole,
  type WorkspaceBootstrapPayload,
  type WorkspaceSnapshot
} from "@workpilot/shared";
import type {
  ControlPlaneStorage,
  CreateAgentInput,
  CreateWorkspaceInput,
  CreateWorkspaceInvitationInput,
  EnsureAgentDirectChannelInput,
  GrantPermissionInput,
  CreateIssueFromMessagesInput,
  CreateIssueFromMessageInput,
  CreateIssueInput,
  CreateMessageInput,
  CreateRuntimeRegistrationCommandInput,
  RecordRuntimeHeartbeatInput,
  RegisterRuntimeInput,
  UpdateChannelInput,
  ResourcePermission
} from "./types";

export function createInMemoryControlPlaneStorage(): ControlPlaneStorage {
  const runtimeOfflineThresholdMs = 60_000;
  const workspaces = createSeedState();
  const workspaceMetadataByOrganization = new Map<string, { name: string; slug: string; description: string }>([
    ["org_demo", { name: "abc", slug: "abc", description: "" }]
  ]);
  const channelsByOrganization = createSeedChannels();
  const channelParticipantsByOrganization = createSeedChannelParticipants();
  const agentActivitiesByOrganization = new Map<string, Map<string, AgentActivityDTO>>();
  const membershipsByOrganization = new Map<string, Array<{ userId: string; email: string; role: MembershipRole }>>([
    [
      "org_demo",
      [
        { userId: "usr_admin", email: "admin@workpilot.local", role: "admin" },
        { userId: "usr_member", email: "member@workpilot.local", role: "member" }
      ]
    ]
  ]);
  const permissionsByOrganization = new Map<string, Map<string, Array<{
    id: string;
    organizationId: string;
    userId: string;
    resourceType: "runtime" | "agent" | "channel";
    resourceId: string;
    permission: ResourcePermission;
    createdAt: string;
    createdBy: string;
  }>>>();
  const invitationsByOrganization = new Map<string, Array<{
    id: string;
    organizationId: string;
    email: string;
    role: "owner" | "admin" | "member";
    invitedBy: string;
    token: string;
    expiresAt: string;
    acceptedAt: string | null;
    createdAt: string;
  }>>();
  const agentWorkspaceFilesByAgentId = new Map<string, Map<string, AgentWorkspaceFileContentDTO>>();
  const demoSession: AuthSession = {
    userId: "usr_admin",
    organizationId: "org_demo",
    email: "admin@workpilot.local",
    role: "admin"
  };
  const demoUsers = [
    { userId: "usr_admin", email: "admin@workpilot.local", role: "admin" as MembershipRole },
    { userId: "usr_member", email: "member@workpilot.local", role: "member" as MembershipRole },
  ];

  return {
    async getDemoSession() {
      return demoSession;
    },
    async getWorkspacesForUser(userId) {
      return Array.from(workspaces.values())
        .filter((workspace) =>
          (membershipsByOrganization.get(workspace.organization.id) ?? []).some((member) => member.userId === userId)
        )
        .map((workspace) => ({
          id: workspace.organization.id,
          name: workspaceMetadataByOrganization.get(workspace.organization.id)?.name ?? workspace.organization.id,
          slug: workspaceMetadataByOrganization.get(workspace.organization.id)?.slug ?? workspace.organization.id
        }));
    },
    async createWorkspace(input: CreateWorkspaceInput) {
      const normalizedName = input.name.trim();
      if (!normalizedName) {
        throw new Error("Workspace name is required.");
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(normalizedName)) {
        throw new Error("Workspace name may only contain letters, digits, spaces, hyphens, and underscores.");
      }

      let slug = normalizedName
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || "workspace";
      let id = `org_${slug.replace(/-/g, "_")}`;
      let suffix = 1;

      while (workspaces.has(id)) {
        suffix += 1;
        slug = `${slug}-${suffix}`;
        id = `org_${slug.replace(/-/g, "_")}`;
      }

      const workspace = createWorkspaceSnapshot({
        organizationId: id
      });
      workspaces.set(id, workspace);
      workspaceMetadataByOrganization.set(id, {
        name: normalizedName,
        slug,
        description: input.description?.trim() ?? ""
      });
      const channelId = `chn_${slug.replace(/-/g, "_")}_general`;
      channelsByOrganization.set(id, [
        {
          id: channelId,
          type: "group",
          name: "all",
          unreadCount: 0,
          description: "General collaboration"
        }
      ]);
      channelParticipantsByOrganization.set(id, [
        { channelId, participantId: input.userId, participantType: "user" }
      ]);
      membershipsByOrganization.set(id, [
        {
          userId: input.userId,
          email: `${input.userId}@workpilot.local`,
          role: "owner"
        }
      ]);

      return {
        id,
        name: normalizedName,
        slug
      };
    },
    async getOrganization(orgId) {
      const workspace = workspaces.get(orgId);
      return workspace?.organization ?? null;
    },
    async getChannel(channelId) {
      return findChannelById(channelsByOrganization, channelId) ?? null;
    },
    async getChannels(orgId) {
      const workspace = workspaces.get(orgId);
      const channels = channelsByOrganization.get(orgId) ?? [];
      if (!workspace) {
        return channels;
      }

      const visibleRuntimeIds = new Set(
        workspace.runtimes.filter((runtime) => runtime.status !== "deleted").map((runtime) => runtime.id)
      );
      const visibleAgentIds = new Set(
        workspace.agents
          .filter((agent) => agent.status !== "deleted" && visibleRuntimeIds.has(agent.runtimeId))
          .map((agent) => agent.id)
      );
      const hiddenDirectChannelIds = new Set(
        workspace.agents.filter((agent) => !visibleAgentIds.has(agent.id)).map((agent) => agent.channelId)
      );
      const hiddenIssueChannelIds = new Set(workspace.issues.map((issue) => issue.discussionChannelId));

      return channels.filter(
        (channel) => !hiddenDirectChannelIds.has(channel.id) && !hiddenIssueChannelIds.has(channel.id)
      );
    },
    async createChannel(input) {
      const workspace = requireWorkspace(workspaces, input.organizationId);
      const channels = channelsByOrganization.get(input.organizationId) ?? [];
      const channel = createGroupChannel(channels, input.name, input.description);
      const participants = channelParticipantsByOrganization.get(input.organizationId) ?? [];
      const requestedParticipants = dedupeChannelParticipants([
        ...(input.actorId ? [{ participantId: input.actorId, participantType: "user" as const }] : []),
        ...(input.members ?? [])
      ]);

      channelsByOrganization.set(workspace.organization.id, [...channels, channel]);
      channelParticipantsByOrganization.set(
        workspace.organization.id,
        [
          ...participants,
          ...requestedParticipants.map((participant) => ({
            channelId: channel.id,
            participantId: participant.participantId,
            participantType: participant.participantType
          }))
        ]
      );
      return channel;
    },
    async getMessages(input) {
      const workspace = findWorkspaceByChannel(workspaces, channelsByOrganization, input.channelId);
      return workspace?.messages
        .filter(
          (message) =>
            message.channelId === input.channelId &&
            (!input.after || Date.parse(message.createdAt) > Date.parse(input.after))
        )
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
      if (workspace) {
        reconcileOfflineRuntimes(workspace, {
          offlineThresholdMs: runtimeOfflineThresholdMs
        });
      }
      return (
        workspace?.runtimes.map((runtime) => ({
          id: runtime.id,
          name: runtime.name,
          status: runtime.status,
          lastHeartbeatAt: runtime.lastHeartbeatAt
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
      if (workspace) {
        reconcileOfflineRuntimes(workspace, {
          offlineThresholdMs: runtimeOfflineThresholdMs
        });
      }
      return toBootstrapPayload(workspace, channelsByOrganization.get(orgId) ?? [], agentActivitiesByOrganization.get(orgId));
    },
    async getWorkspaceBootstrapForRuntime(runtimeId) {
      const workspace = findWorkspaceByRuntimeId(workspaces, runtimeId);
      if (workspace) {
        reconcileOfflineRuntimes(workspace, {
          offlineThresholdMs: runtimeOfflineThresholdMs
        });
      }
      return toBootstrapPayload(
        workspace,
        workspace ? channelsByOrganization.get(workspace.organization.id) ?? [] : [],
        workspace ? agentActivitiesByOrganization.get(workspace.organization.id) : undefined
      );
    },
    async getWorkspaceBootstrapForChannel(channelId) {
      const workspace = findWorkspaceByChannelId(workspaces, channelsByOrganization, channelId);
      if (workspace) {
        reconcileOfflineRuntimes(workspace, {
          offlineThresholdMs: runtimeOfflineThresholdMs
        });
      }
      return toBootstrapPayload(
        workspace,
        workspace ? channelsByOrganization.get(workspace.organization.id) ?? [] : [],
        workspace ? agentActivitiesByOrganization.get(workspace.organization.id) : undefined
      );
    },
    async getAgentIdsForRuntime(runtimeId) {
      const workspace = findWorkspaceByRuntimeId(workspaces, runtimeId);
      if (!workspace) return [];
      return workspace.agents.filter((a) => a.runtimeId === runtimeId).map((a) => a.id);
    },
    async getAgentsForChannel(channelId) {
      const workspace = findWorkspaceByChannelId(workspaces, channelsByOrganization, channelId);
      if (!workspace) return [];
      return workspace.agents.filter((a) => a.channelId === channelId);
    },
    async getAgentActivitiesForAgents(agentIds) {
      if (agentIds.length === 0) return [];
      const idSet = new Set(agentIds);
      const results: AgentActivityDTO[] = [];
      for (const [, activities] of agentActivitiesByOrganization) {
        for (const activity of activities.values()) {
          if (idSet.has(activity.agentId)) {
            results.push(activity);
          }
        }
      }
      return results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    async getAgentRunLogsForChannel(channelId, after) {
      for (const workspace of workspaces.values()) {
        const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
        if (channels.some((c) => c.id === channelId)) {
          let logs = workspace.agentRunLogs.filter((log) => log.channelId === channelId);
          if (after) {
            logs = logs.filter((log) => Date.parse(log.createdAt) > Date.parse(after));
          }
          return logs;
        }
      }
      return [];
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
      const participants = channelParticipantsByOrganization.get(workspace.organization.id) ?? [];
      const channel = createDirectChannelForAgent(channels, input.name);
      channelsByOrganization.set(workspace.organization.id, [...channels, channel]);
      const agent = createAgentProfile(workspace, {
        ...input,
        channelId: channel.id
      });
      channelParticipantsByOrganization.set(workspace.organization.id, [
        ...participants,
        { channelId: channel.id, participantId: "usr_admin", participantType: "user" },
        { channelId: channel.id, participantId: agent.id, participantType: "agent" }
      ]);
      return {
        ...toAgentIdentity(agent)
      };
    },
    async ensureAgentDirectChannel(input: EnsureAgentDirectChannelInput) {
      const workspace = findWorkspaceByAgentId(workspaces, input.agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      const participants = channelParticipantsByOrganization.get(workspace.organization.id) ?? [];
      const existing = channels.find((channel) => {
        if (channel.type !== "direct") {
          return false;
        }

        const channelParticipants = participants.filter((participant) => participant.channelId === channel.id);
        return (
          channelParticipants.some(
            (participant) => participant.participantType === "user" && participant.participantId === input.userId
          ) &&
          channelParticipants.some(
            (participant) => participant.participantType === "agent" && participant.participantId === input.agentId
          )
        );
      });

      if (existing) {
        return existing;
      }

      const agent = workspace.agents.find((entry) => entry.id === input.agentId);
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const channel = createDirectChannelForUserAndAgent(channels, input.userId, agent.name);
      channelsByOrganization.set(workspace.organization.id, [...channels, channel]);
      channelParticipantsByOrganization.set(workspace.organization.id, [
        ...participants,
        { channelId: channel.id, participantId: input.userId, participantType: "user" },
        { channelId: channel.id, participantId: input.agentId, participantType: "agent" }
      ]);

      return channel;
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
      const message = createMessage(workspace, {
        ...input,
        now: input.occurredAt
      });
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
      const issue = createIssue(workspace, input);
      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      channelsByOrganization.set(workspace.organization.id, [
        ...channels,
        {
          id: issue.discussionChannelId,
          type: "group",
          name: `issue-${issue.id.slice(-6)}`,
          description: "Hidden issue discussion",
          unreadCount: 0
        }
      ]);
      return toIssueDto(issue);
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

      const previous = { ...issue };
      issue.status = input.status ?? issue.status;
      issue.assigneeId = input.assigneeId === undefined ? issue.assigneeId : input.assigneeId;
      issue.title = input.title ?? issue.title;
      issue.description = input.description ?? issue.description;
      issue.priority = input.priority ?? issue.priority;
      issue.dueDate = input.dueDate === undefined ? issue.dueDate : input.dueDate;
      issue.project = input.project === undefined ? issue.project : input.project;
      issue.updatedAt = new Date().toISOString();

      if (previous.status !== issue.status) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "status_changed",
          field: "status",
          fromValue: previous.status,
          toValue: issue.status,
          message: null,
          createdAt: issue.updatedAt
        });
      }
      if (previous.assigneeId !== issue.assigneeId) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "assignee_changed",
          field: "assigneeId",
          fromValue: previous.assigneeId,
          toValue: issue.assigneeId,
          message: null,
          createdAt: issue.updatedAt
        });
      }
      if (previous.priority !== issue.priority) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "priority_changed",
          field: "priority",
          fromValue: previous.priority,
          toValue: issue.priority,
          message: null,
          createdAt: issue.updatedAt
        });
      }
      if (previous.dueDate !== issue.dueDate) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "due_date_changed",
          field: "dueDate",
          fromValue: previous.dueDate,
          toValue: issue.dueDate,
          message: null,
          createdAt: issue.updatedAt
        });
      }
      if (previous.title !== issue.title) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "title_changed",
          field: "title",
          fromValue: previous.title,
          toValue: issue.title,
          message: null,
          createdAt: issue.updatedAt
        });
      }
      if (previous.description !== issue.description) {
        appendIssueActivity(workspace, {
          issueId: issue.id,
          actorId: input.actorId,
          actorType: "user",
          kind: "description_changed",
          field: "description",
          fromValue: previous.description,
          toValue: issue.description,
          message: null,
          createdAt: issue.updatedAt
        });
      }

      return toIssueDto(issue);
    },
    async deleteIssue(input) {
      const workspace = findWorkspaceByIssueId(workspaces, input.issueId);
      if (!workspace) {
        throw new Error("Issue was not found.");
      }

      const issueIndex = workspace.issues.findIndex((entry) => entry.id === input.issueId);
      if (issueIndex < 0) {
        throw new Error("Issue was not found.");
      }

      workspace.issues.splice(issueIndex, 1);
      workspace.issueActivities = workspace.issueActivities.filter((activity) => activity.issueId !== input.issueId);
      return { issueId: input.issueId };
    },
    async createIssueComment(input) {
      const workspace = findWorkspaceByIssueId(workspaces, input.issueId);
      if (!workspace) {
        throw new Error("Issue was not found.");
      }

      const issue = workspace.issues.find((entry) => entry.id === input.issueId);
      if (!issue) {
        throw new Error("Issue was not found.");
      }

      const activity = appendIssueActivity(workspace, {
        issueId: input.issueId,
        actorId: input.actorId,
        actorType: input.actorType,
        kind: "commented",
        field: null,
        fromValue: null,
        toValue: null,
        message: input.message.trim(),
        createdAt: input.occurredAt ?? new Date().toISOString()
      });
      issue.updatedAt = activity.createdAt;
      return toIssueActivityDto(activity);
    },
    async getIssueActivities(issueId) {
      const workspace = findWorkspaceByIssueId(workspaces, issueId);
      if (!workspace) {
        throw new Error("Issue was not found.");
      }

      return workspace.issueActivities
        .filter((activity) => activity.issueId === issueId)
        .map((activity): IssueActivityDTO => toIssueActivityDto(activity))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt));
    },
    async createIssueFromMessage(input: CreateIssueFromMessageInput) {
      const workspace = findWorkspaceByMessageId(workspaces, input.messageId);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }
      const issue = createIssueFromMessage(workspace, input);
      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      channelsByOrganization.set(workspace.organization.id, [
        ...channels,
        {
          id: issue.discussionChannelId,
          type: "group",
          name: `issue-${issue.id.slice(-6)}`,
          description: "Hidden issue discussion",
          unreadCount: 0
        }
      ]);
      return toIssueDto(issue);
    },
    async createIssueFromMessages(input: CreateIssueFromMessagesInput) {
      const workspace = findWorkspaceByMessageIds(workspaces, input.messageIds);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }
      const issue = createIssueFromMessages(workspace, input);
      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      channelsByOrganization.set(workspace.organization.id, [
        ...channels,
        {
          id: issue.discussionChannelId,
          type: "group",
          name: `issue-${issue.id.slice(-6)}`,
          description: "Hidden issue discussion",
          unreadCount: 0
        }
      ]);
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
        sourceMessages: claim.sourceMessages.map((message) => toMessageDto(message)),
        issueActivities: workspace.issueActivities
          .filter((activity) => activity.issueId === claim.issue.id)
          .map((activity) => toIssueActivityDto(activity))
          .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
      }));
    },
    async recordAgentActivity(input) {
      const workspace = findWorkspaceByAgentId(workspaces, input.agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      const activities = agentActivitiesByOrganization.get(workspace.organization.id) ?? new Map<string, AgentActivityDTO>();
      const activity: AgentActivityDTO = {
        agentId: input.agentId,
        status: input.status,
        summary: input.summary,
        detail: input.detail ?? null,
        updatedAt: input.occurredAt ?? new Date().toISOString()
      };

      activities.set(input.agentId, activity);
      agentActivitiesByOrganization.set(workspace.organization.id, activities);

      return {
        activity
      };
    },
    async recordAgentRunLog(input) {
      const workspace = findWorkspaceByAgentId(workspaces, input.agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      const log = recordAgentRunLog(workspace, input);

      return {
        log: {
          id: log.id,
          agentId: log.agentId,
          runtimeId: log.runtimeId,
          channelId: log.channelId,
          issueId: log.issueId,
          sessionId: log.sessionId,
          kind: log.kind,
          prompt: log.prompt,
          response: log.response,
          createdAt: log.createdAt
        }
      };
    },
    async syncAgentWorkspaceFiles(input) {
      const workspace = findWorkspaceByAgentId(workspaces, input.agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      const files = new Map<string, AgentWorkspaceFileContentDTO>();
      for (const file of input.files) {
        files.set(file.path, file);
      }
      agentWorkspaceFilesByAgentId.set(input.agentId, files);

      return {
        files: [...files.values()]
          .map(({ content: _content, ...file }) => file)
          .sort((left, right) => left.path.localeCompare(right.path))
      };
    },
    async listAgentWorkspaceFiles(agentId) {
      const workspace = findWorkspaceByAgentId(workspaces, agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      return [...(agentWorkspaceFilesByAgentId.get(agentId)?.values() ?? [])]
        .map(({ content: _content, ...file }) => file)
        .sort((left, right) => left.path.localeCompare(right.path));
    },
    async getAgentWorkspaceFile(agentId, path) {
      const workspace = findWorkspaceByAgentId(workspaces, agentId);
      if (!workspace) {
        throw new Error("Agent was not found.");
      }

      return agentWorkspaceFilesByAgentId.get(agentId)?.get(path) ?? null;
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
      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      const participants = channelParticipantsByOrganization.get(workspace.organization.id) ?? [];
      const claimedSourceMessageIds = new Set(workspace.agentMessageClaims.map((claim) => claim.sourceMessageId));
      const runtimeAgents = workspace.agents.filter((agent) => agent.runtimeId === input.runtimeId && agent.status === "running");
      const runtimeAgentsById = new Map(runtimeAgents.map((agent) => [agent.id, agent]));
      const claims = workspace.messages
        .filter(
          (message) =>
            message.senderType === "user" &&
            !claimedSourceMessageIds.has(message.id)
        )
        .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
        .slice(0, input.limit ?? 20)
        .flatMap((message) => {
          const channel = channels.find((entry) => entry.id === message.channelId);
          if (!channel) {
            return [];
          }

          const agentParticipant = participants.find(
            (participant) =>
              participant.channelId === message.channelId &&
              participant.participantType === "agent" &&
              runtimeAgentsById.has(participant.participantId) &&
              (channel.type === "direct" || messageMentionsAgent(message.content, runtimeAgentsById.get(participant.participantId)?.name ?? ""))
          );
          if (!agentParticipant) {
            return [];
          }
          const agent = runtimeAgentsById.get(agentParticipant.participantId);
          if (!agent) {
            return [];
          }

          workspace.agentMessageClaims.push({
            id: `amc_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
            organizationId: workspace.organization.id,
            runtimeId: input.runtimeId,
            agentId: agent.id,
            sourceMessageId: message.id,
            claimedAt: input.occurredAt ?? new Date().toISOString(),
            respondedAt: null,
            responseMessageId: null
          });

          return [
            {
              agent: toAgentIdentity(agent),
              sourceMessage: toMessageDto(message),
              isFirstUserMessage:
                workspace.messages
                  .filter((entry) => entry.channelId === message.channelId && entry.senderType === "user")
                  .findIndex((entry) => entry.id === message.id) === 0
            }
          ];
        });

      return claims;
    },
    async recordAgentMessageResponse(input) {
      const workspace = findWorkspaceByMessageId(workspaces, input.sourceMessageId);
      if (!workspace) {
        throw new Error("Source message was not found.");
      }
      const agent = workspace.agents.find((entry) => entry.id === input.agentId);
      const claim = workspace.agentMessageClaims.find(
        (entry) => entry.agentId === input.agentId && entry.sourceMessageId === input.sourceMessageId
      );
      const sourceMessage = workspace.messages.find((entry) => entry.id === input.sourceMessageId);

      if (!agent) {
        throw new Error("Agent was not found.");
      }

      if (!claim) {
        throw new Error("Agent message claim was not found.");
      }

      if (!sourceMessage) {
        throw new Error("Source message was not found.");
      }

      const channel = findChannelById(channelsByOrganization, sourceMessage.channelId);
      const senderMember = (membershipsByOrganization.get(workspace.organization.id) ?? []).find(
        (entry) => entry.userId === sourceMessage.senderId
      );
      const senderAgent = workspace.agents.find((entry) => entry.id === sourceMessage.senderId);
      const senderDisplayName =
        sourceMessage.senderType === "user"
          ? (senderMember?.email.split("@")[0] ?? sourceMessage.senderId)
          : senderAgent?.name ?? sourceMessage.senderId;
      const responseContent =
        channel?.type === "group"
          ? prefixMentionedReply(input.content, senderDisplayName)
          : input.content;

      const message = createMessage(workspace, {
        channelId: sourceMessage.channelId,
        content: responseContent,
        senderId: agent.id,
        senderType: "agent",
        now: input.occurredAt
      });
      claim.respondedAt = input.occurredAt ?? new Date().toISOString();
      claim.responseMessageId = message.id;

      return {
        message: toMessageDto(message)
      };
    },
    async getPendingAgentResponses(agentId: string) {
      const results: Array<{
        id: string;
        agentId: string;
        channelId: string;
        messageId: string;
        prompt: string;
        status: "pending" | "processing" | "completed" | "failed";
        createdAt: string;
        completedAt: string | null;
      }> = [];
      
      for (const workspace of workspaces.values()) {
        const pending = workspace.pendingAgentResponses?.filter(
          (p) => p.agentId === agentId && p.status === "pending"
        ) ?? [];
        results.push(...pending);
      }
      return results;
    },
    async claimAgentResponse(responseId: string, agentId: string) {
      for (const workspace of workspaces.values()) {
        const pending = workspace.pendingAgentResponses?.find(
          (p) => p.id === responseId && p.agentId === agentId && p.status === "pending"
        );
        if (pending) {
          pending.status = "processing";
          return pending;
        }
      }
      throw new Error("Pending response not found.");
    },
    async completeAgentResponse(responseId: string) {
      for (const workspace of workspaces.values()) {
        const pending = workspace.pendingAgentResponses?.find(
          (p) => p.id === responseId
        );
        if (pending) {
          pending.status = "completed";
          pending.completedAt = new Date().toISOString();
          return;
        }
      }
    },
    async getWorkspacePermissions(orgId: string, userId?: string) {
      const perms = permissionsByOrganization.get(orgId) ?? new Map();
      const result: Array<{
        id: string;
        organizationId: string;
        userId: string;
        resourceType: "runtime" | "agent" | "channel";
        resourceId: string;
        permission: ResourcePermission;
        createdAt: string;
        createdBy: string;
      }> = [];
      
      for (const [, userPerms] of perms) {
        for (const p of userPerms) {
          if (!userId || p.userId === userId) {
            result.push(p);
          }
        }
      }
      return result;
    },
    async grantPermission(input: GrantPermissionInput) {
      let perms = permissionsByOrganization.get(input.organizationId);
      if (!perms) {
        perms = new Map();
        permissionsByOrganization.set(input.organizationId, perms);
      }
      
      let userPerms = perms.get(input.userId);
      if (!userPerms) {
        userPerms = [];
        perms.set(input.userId, userPerms);
      }
      
      const permission: {
        id: string;
        organizationId: string;
        userId: string;
        resourceType: "runtime" | "agent" | "channel";
        resourceId: string;
        permission: ResourcePermission;
        createdAt: string;
        createdBy: string;
      } = {
        id: `perm_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        organizationId: input.organizationId,
        userId: input.userId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permission: input.permission,
        createdAt: new Date().toISOString(),
        createdBy: input.grantedBy
      };
      
      userPerms.push(permission);
      return permission;
    },
    async revokePermission(input) {
      for (const perms of permissionsByOrganization.values()) {
        for (const userPerms of perms.values()) {
          const idx = userPerms.findIndex((p) => p.id === input.permissionId);
          if (idx >= 0) {
            userPerms.splice(idx, 1);
            return;
          }
        }
      }
    },
    async getWorkspaceInvitations(orgId: string) {
      return invitationsByOrganization.get(orgId) ?? [];
    },
    async createWorkspaceInvitation(input: CreateWorkspaceInvitationInput) {
      let invites = invitationsByOrganization.get(input.organizationId);
      if (!invites) {
        invites = [];
        invitationsByOrganization.set(input.organizationId, invites);
      }
      
      const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
      const invitation = {
        id: `inv_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`,
        organizationId: input.organizationId,
        email: input.email,
        role: input.role,
        invitedBy: input.invitedBy,
        token: `invite_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`,
        expiresAt: new Date(Date.now() + ttlMs).toISOString(),
        acceptedAt: null,
        createdAt: new Date().toISOString()
      };
      
      invites.push(invitation);
      return invitation;
    },
    async acceptWorkspaceInvitation(token: string, userId: string) {
      for (const invites of invitationsByOrganization.values()) {
        const idx = invites.findIndex((i) => i.token === token);
        if (idx >= 0) {
          const invite = invites[idx];
          if (new Date(invite.expiresAt) < new Date()) {
            throw new Error("Invitation has expired.");
          }
          invite.acceptedAt = new Date().toISOString();
          return;
        }
      }
      throw new Error("Invalid invitation token.");
    },
    async getOrganizationMembers(orgId: string) {
      return membershipsByOrganization.get(orgId) ?? [];
    },
    async getChannelParticipants(channelId) {
      const workspace = findWorkspaceByChannelId(workspaces, channelsByOrganization, channelId);
      if (!workspace) {
        throw new Error("Channel not found.");
      }

      const participants = (channelParticipantsByOrganization.get(workspace.organization.id) ?? []).filter(
        (participant) => participant.channelId === channelId
      );
      const memberships = membershipsByOrganization.get(workspace.organization.id) ?? [];

      return participants.flatMap<ChannelParticipantDTO>((participant) => {
        if (participant.participantType === "user") {
          const member = memberships.find((entry) => entry.userId === participant.participantId);
          if (!member) {
            return [];
          }

          return [{
            participantId: participant.participantId,
            participantType: "user",
            displayName: member.email.split("@")[0] ?? member.email,
            email: member.email,
            role: member.role,
            agentStatus: null
          }];
        }

        const agent = workspace.agents.find((entry) => entry.id === participant.participantId);
        if (!agent) {
          return [];
        }

        return [{
          participantId: participant.participantId,
          participantType: "agent",
          displayName: agent.name,
          email: null,
          role: null,
          agentStatus: agent.status
        }];
      });
    },
    async updateChannel(input: UpdateChannelInput) {
      const workspace = findWorkspaceByChannelId(workspaces, channelsByOrganization, input.channelId);
      if (!workspace) {
        throw new Error("Channel not found.");
      }

      const channels = channelsByOrganization.get(workspace.organization.id) ?? [];
      const channel = channels.find((entry) => entry.id === input.channelId);
      if (!channel) {
        throw new Error("Channel not found.");
      }

      const nextName = input.name.trim().toLowerCase();
      if (!nextName) {
        throw new Error("Channel name is required.");
      }
      if (channel.id === "chn_general" && nextName !== channel.name) {
        throw new Error("The #all channel cannot be renamed.");
      }

      channel.name = nextName;
      channel.description = input.description?.trim() ? input.description.trim() : null;

      return channel;
    }
  };
}

type ChannelParticipant = {
  channelId: string;
  participantId: string;
  participantType: "user" | "agent";
};

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
    discussionChannelId: issue.discussionChannelId,
    createdAt: issue.createdAt,
    updatedAt: issue.updatedAt
  };
}

function toIssueActivityDto(activity: WorkspaceSnapshot["issueActivities"][number]) {
  return {
    id: activity.id,
    issueId: activity.issueId,
    actorId: activity.actorId,
    actorType: activity.actorType,
    kind: activity.kind,
    field: activity.field,
    fromValue: activity.fromValue,
    toValue: activity.toValue,
    message: activity.message,
    createdAt: activity.createdAt
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

function toBootstrapPayload(
  workspace: WorkspaceSnapshot | undefined,
  channels: ChannelSummary[],
  agentActivitiesById?: Map<string, AgentActivityDTO>
): WorkspaceBootstrapPayload {
  const visibleRuntimeIds = new Set(
    workspace?.runtimes.filter((runtime) => runtime.status !== "deleted").map((runtime) => runtime.id) ?? []
  );
  const visibleAgents =
    workspace?.agents.filter((agent) => agent.status !== "deleted" && visibleRuntimeIds.has(agent.runtimeId)) ?? [];
  const visibleAgentIds = new Set(visibleAgents.map((agent) => agent.id));
  const hiddenDirectChannelIds = new Set(
    (workspace?.agents ?? []).filter((agent) => !visibleAgentIds.has(agent.id)).map((agent) => agent.channelId)
  );
  const hiddenIssueChannelIds = new Set((workspace?.issues ?? []).map((issue) => issue.discussionChannelId));
  const visibleChannels = channels.filter((channel) => !hiddenDirectChannelIds.has(channel.id) && !hiddenIssueChannelIds.has(channel.id));
  const visibleChannelIds = new Set(visibleChannels.map((channel) => channel.id));
  const visibleIssueChannelIds = new Set((workspace?.issues ?? []).map((issue) => issue.discussionChannelId));

  return {
    organization: workspace?.organization ?? null,
    channels: visibleChannels,
    runtimes:
      workspace?.runtimes
        .filter((runtime) => runtime.status !== "deleted")
        .map((runtime) => ({
          id: runtime.id,
          name: runtime.name,
          status: runtime.status,
          lastHeartbeatAt: runtime.lastHeartbeatAt
        })) ?? [],
    agents: visibleAgents.map((agent) => ({
      ...toAgentIdentity(agent)
    })),
    agentActivities: [...(agentActivitiesById?.values() ?? [])]
      .filter((activity) => visibleAgentIds.has(activity.agentId))
      .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
    agentRunLogs:
      workspace?.agentRunLogs
        .filter((log) => visibleAgentIds.has(log.agentId) && (!log.channelId || visibleChannelIds.has(log.channelId)))
        .map(
          (log): AgentRunLogDTO => ({
            id: log.id,
            agentId: log.agentId,
            runtimeId: log.runtimeId,
            channelId: log.channelId,
            issueId: log.issueId,
            sessionId: log.sessionId,
            kind: log.kind,
            prompt: log.prompt,
            response: log.response,
            createdAt: log.createdAt
          })
        )
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)) ?? [],
    messages:
      workspace?.messages
        .filter((message) => visibleChannelIds.has(message.channelId) || visibleIssueChannelIds.has(message.channelId))
        .map((message) => toMessageDto(message)) ?? [],
    issues: workspace?.issues.map((issue) => toIssueDto(issue)) ?? [],
    issueActivities:
      workspace?.issueActivities
        .map((activity) => toIssueActivityDto(activity))
        .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)) ?? []
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
    model: "default",
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

function createSeedChannelParticipants(): Map<string, ChannelParticipant[]> {
  return new Map([
    [
      "org_demo",
      [
        { channelId: "chn_general", participantId: "usr_admin", participantType: "user" },
        { channelId: "chn_general", participantId: "usr_member", participantType: "user" },
        { channelId: "chn_general", participantId: "agt_seed", participantType: "agent" },
        { channelId: "dir_admin_ops", participantId: "usr_admin", participantType: "user" },
        { channelId: "dir_admin_ops", participantId: "agt_seed", participantType: "agent" }
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

function findWorkspaceByChannelId(
  workspaces: Map<string, WorkspaceSnapshot>,
  channelsByOrganization: Map<string, ChannelSummary[]>,
  channelId: string
) {
  const organizationId = Array.from(channelsByOrganization.entries()).find(([, channels]) =>
    channels.some((channel) => channel.id === channelId)
  )?.[0];

  return organizationId ? workspaces.get(organizationId) : undefined;
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

function createDirectChannelForUserAndAgent(
  existingChannels: ChannelSummary[],
  userId: string,
  agentName: string
): ChannelSummary {
  const userSlug = userId
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  const agentSlug = agentName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 24);
  let id = `dir_${userSlug || "user"}_${agentSlug || "agent"}`;
  let suffix = 1;

  while (existingChannels.some((channel) => channel.id === id)) {
    suffix += 1;
    id = `dir_${userSlug || "user"}_${agentSlug || "agent"}_${suffix}`;
  }

  return {
    id,
    type: "direct",
    name: `${userId} x ${agentName}`,
    unreadCount: 0
  };
}

function createGroupChannel(existingChannels: ChannelSummary[], rawName: string, rawDescription?: string): ChannelSummary {
  const name = rawName.trim().toLowerCase();
  const description = rawDescription?.trim() ? rawDescription.trim() : null;

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
    description,
    unreadCount: 0
  };
}

function dedupeChannelParticipants(
  participants: Array<{
    participantId: string;
    participantType: "user" | "agent";
  }>
) {
  const seen = new Set<string>();
  return participants.filter((participant) => {
    const key = `${participant.participantType}:${participant.participantId}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function messageMentionsAgent(content: string, agentName: string) {
  if (!agentName.trim()) {
    return false;
  }

  const escapedName = agentName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|\\s)@${escapedName}(?=$|\\s|[.,!?;:])`, "i").test(content);
}

function prefixMentionedReply(content: string, displayName: string) {
  const normalized = content.trim();
  if (!displayName.trim()) {
    return normalized;
  }

  const mention = `@${displayName}`;
  return normalized.startsWith(mention) ? normalized : `${mention} ${normalized}`.trim();
}

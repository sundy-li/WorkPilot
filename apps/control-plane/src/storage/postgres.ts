import { SQL } from "bun";
import type {
  AgentActivityDTO,
  AgentControlActionDTO,
  AgentIdentity,
  IssueActivityDTO,
  AgentRunLogDTO,
  AgentWorkspaceFileContentDTO,
  RuntimeIssueClaimDTO,
  AuthSession,
  ChannelParticipantDTO,
  ChannelSummary,
  IssueDTO,
  MessageDTO,
  RuntimeIdentity,
  WorkspaceBootstrapPayload
} from "@workpilot/shared";
import { assertSafeIdentifier, readSchemaSql } from "./schema";
import type {
  ControlPlaneStorage,
  CreateAgentInput,
  CreateWorkspaceInput,
  CreateIssueFromMessagesInput,
  CreateIssueFromMessageInput,
  CreateMessageInput,
  CreateRuntimeRegistrationCommandInput,
  CreateWorkspaceInvitationInput,
  RecordRuntimeHeartbeatInput,
  RegisterRuntimeInput,
  GrantPermissionInput,
  UpdateIssueInput,
  UpdateChannelInput
} from "./types";

interface CreatePostgresControlPlaneStorageOptions {
  databaseUrl: string;
  schema?: string;
}

type SqlClient = InstanceType<typeof SQL> | Bun.ReservedSQL;

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

function mapIssueActivityRow(row: {
  id: string;
  issueId: string;
  actorId: string;
  actorType: IssueActivityDTO["actorType"];
  kind: IssueActivityDTO["kind"];
  field: string | null;
  fromValue: string | null;
  toValue: string | null;
  message: string | null;
  createdAt: string;
}): IssueActivityDTO {
  return {
    id: row.id,
    issueId: row.issueId,
    actorId: row.actorId,
    actorType: row.actorType,
    kind: row.kind,
    field: row.field,
    fromValue: row.fromValue,
    toValue: row.toValue,
    message: row.message,
    createdAt: row.createdAt
  };
}

async function insertIssueActivity(
  sql: SqlClient,
  input: Omit<IssueActivityDTO, "id"> & { id?: string; organizationId: string }
) {
  await sql`
    insert into issue_activities (
      id,
      organization_id,
      issue_id,
      actor_id,
      actor_type,
      kind,
      field,
      from_value,
      to_value,
      message,
      created_at
    )
    values (
      ${input.id ?? createId("isa")},
      ${input.organizationId},
      ${input.issueId},
      ${input.actorId},
      ${input.actorType},
      ${input.kind},
      ${input.field},
      ${input.fromValue},
      ${input.toValue},
      ${input.message},
      ${input.createdAt}
    )
  `;
}

function describeIssueMutations(previous: IssueDTO, next: IssueDTO, actorId: string, createdAt: string): Array<Omit<IssueActivityDTO, "id"> & { organizationId?: string }> {
  const activities: Array<Omit<IssueActivityDTO, "id"> & { organizationId?: string }> = [];

  if (previous.status !== next.status) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "status_changed",
      field: "status",
      fromValue: previous.status,
      toValue: next.status,
      message: null,
      createdAt
    });
  }

  if (previous.assigneeId !== next.assigneeId) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "assignee_changed",
      field: "assigneeId",
      fromValue: previous.assigneeId,
      toValue: next.assigneeId,
      message: null,
      createdAt
    });
  }

  if (previous.priority !== next.priority) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "priority_changed",
      field: "priority",
      fromValue: previous.priority,
      toValue: next.priority,
      message: null,
      createdAt
    });
  }

  if ((previous.dueDate ?? null) !== (next.dueDate ?? null)) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "due_date_changed",
      field: "dueDate",
      fromValue: previous.dueDate,
      toValue: next.dueDate,
      message: null,
      createdAt
    });
  }

  if (previous.title !== next.title) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "title_changed",
      field: "title",
      fromValue: previous.title,
      toValue: next.title,
      message: null,
      createdAt
    });
  }

  if (previous.description !== next.description) {
    activities.push({
      issueId: next.id,
      actorId,
      actorType: "user",
      kind: "description_changed",
      field: "description",
      fromValue: previous.description,
      toValue: next.description,
      message: null,
      createdAt
    });
  }

  return activities;
}

async function updateIssueWithActivities(sql: SqlClient, input: UpdateIssueInput): Promise<IssueDTO> {
  const updatedAt = input.now ?? new Date().toISOString();

  return await sql.begin(async (transaction) => {
    const [previousIssue] = await transaction<(IssueDTO & { organizationId: string })[]>`
      select
        id,
        organization_id as "organizationId",
        title,
        description,
        status,
        assignee_id as "assigneeId",
        creator_id as "creatorId",
        priority,
        due_date as "dueDate",
        project,
        source_channel_id as "sourceChannelId",
        created_at as "createdAt",
        updated_at as "updatedAt"
      from issues
      where id = ${input.issueId}
      limit 1
    `;

    if (!previousIssue) {
      throw new Error("Issue was not found.");
    }

    const [issue] = await transaction<IssueDTO[]>`
      update issues
      set
        status = coalesce(${input.status ?? null}, status),
        assignee_id = case when ${input.assigneeId === undefined} then assignee_id else ${input.assigneeId ?? null} end,
        title = coalesce(${input.title ?? null}, title),
        description = coalesce(${input.description ?? null}, description),
        priority = coalesce(${input.priority ?? null}, priority),
        due_date = case when ${input.dueDate === undefined} then due_date else ${input.dueDate ?? null} end,
        project = case when ${input.project === undefined} then project else ${input.project ?? null} end,
        updated_at = ${updatedAt}
      where id = ${input.issueId}
      returning
        id,
        title,
        description,
        status,
        assignee_id as "assigneeId",
        creator_id as "creatorId",
        priority,
        due_date as "dueDate",
        project,
        source_channel_id as "sourceChannelId",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    for (const activity of describeIssueMutations(previousIssue, issue, input.actorId, updatedAt)) {
      await insertIssueActivity(transaction, {
        ...activity,
        organizationId: previousIssue.organizationId
      });
    }

    return issue;
  });
}

function prefixMentionedReply(content: string, displayName: string) {
  const normalized = content.trim();
  if (!displayName.trim()) {
    return normalized;
  }

  const mention = `@${displayName}`;
  return normalized.startsWith(mention) ? normalized : `${mention} ${normalized}`.trim();
}

export async function createPostgresControlPlaneStorage(
  options: CreatePostgresControlPlaneStorageOptions
): Promise<ControlPlaneStorage & { initialize(): Promise<void>; seedDemoWorkspace(): Promise<void>; dispose(): Promise<void> }> {
  const runtimeOfflineThresholdMs = 60_000;
  const schema = options.schema ?? "public";
  assertSafeIdentifier(schema);

  const pool = new SQL(options.databaseUrl);
  await pool.connect();

  if (schema !== "public") {
    await pool.unsafe(`create schema if not exists "${schema}"`);
  }

  const sql = await pool.reserve();
  await sql.unsafe(`set search_path to "${schema}"`);

  const demoSession: AuthSession = {
    userId: "usr_admin",
    organizationId: "",
    email: "admin@workpilot.local",
    role: "admin"
  };
  const agentActivitiesByOrganization = new Map<string, Map<string, AgentActivityDTO>>();

  const getOrganization = async (orgId: string) => {
    const [organization] = await sql<{ id: string }[]>`select id from organizations where id = ${orgId} limit 1`;
    return organization ?? null;
  };

  const getChannel = async (channelId: string) => {
    const [channel] = await sql<Array<{ id: string; type: "group" | "direct"; name: string; description: string | null }>>`
      select id, type, name, description
      from channels
      where id = ${channelId}
      limit 1
    `;
    return channel ? { ...channel, unreadCount: 0 } : null;
  };

  const getChannels = async (orgId: string) => {
    const rows = await sql<
      Array<{ id: string; type: "group" | "direct"; name: string; description: string | null }>
    >`
      select c.id, c.type, c.name, c.description
      from channels c
      where c.organization_id = ${orgId}
        and not exists (
          select 1
          from issues i
          where i.discussion_channel_id = c.id
        )
        and (
          c.type <> 'direct'
          or exists (
            select 1
            from agents a
            join runtime_daemons r on r.id = a.runtime_id
            where a.channel_id = c.id
              and a.status <> 'deleted'
              and r.status <> 'deleted'
          )
        )
      order by c.created_at asc
    `;
    return rows.map((row) => ({ ...row, unreadCount: 0 }));
  };

  const getMessages = async (channelId: string, after?: string) => {
    return sql<MessageDTO[]>`
      select id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
      from messages
      where channel_id = ${channelId}
        and (${after ?? null}::timestamptz is null or created_at > ${after ?? null}::timestamptz)
      order by created_at asc
    `;
  };

  const getRuntimes = async (orgId: string) => {
    await reconcileOfflineRuntimeStatuses(orgId);
    return sql<RuntimeIdentity[]>`
      select id, name, status, last_heartbeat_at as "lastHeartbeatAt"
      from runtime_daemons
      where organization_id = ${orgId}
        and status <> 'deleted'
      order by created_at asc
    `;
  };

  const getAgents = async (orgId: string) => {
    return sql<AgentIdentity[]>`
      select
        id,
        runtime_id as "runtimeId",
        channel_id as "channelId",
        name,
        description,
        implementation,
        model,
        reasoning_effort as "reasoningEffort",
        status
      from agents
      where organization_id = ${orgId}
        and status <> 'deleted'
        and runtime_id in (select id from runtime_daemons where status <> 'deleted')
      order by created_at asc
    `;
  };

  const reconcileOfflineRuntimeStatuses = async (orgId: string) => {
    const cutoff = new Date(Date.now() - runtimeOfflineThresholdMs).toISOString();
    await sql`
      update runtime_daemons
      set status = 'offline'
      where organization_id = ${orgId}
        and status not in ('offline', 'revoked', 'deleted')
        and last_heartbeat_at is not null
        and last_heartbeat_at < ${cutoff}
    `;
  };

  async function buildWorkspaceBootstrap(orgId: string): Promise<WorkspaceBootstrapPayload> {
    const [organization, channels, runtimes, agents, issues, issueActivities, messages, agentRunLogs] = await Promise.all([
      getOrganization(orgId),
      getChannels(orgId),
      getRuntimes(orgId),
      getAgents(orgId),
      sql<IssueDTO[]>`
        select
          id, title, description, status,
          assignee_id as "assigneeId", creator_id as "creatorId", priority,
          due_date as "dueDate", project, source_channel_id as "sourceChannelId",
          discussion_channel_id as "discussionChannelId",
          created_at as "createdAt", updated_at as "updatedAt"
        from issues where organization_id = ${orgId} order by created_at asc
      `,
      sql<IssueActivityDTO[]>`
        select
          id, issue_id as "issueId", actor_id as "actorId", actor_type as "actorType",
          kind, field, from_value as "fromValue", to_value as "toValue", message,
          created_at as "createdAt"
        from issue_activities where organization_id = ${orgId} order by created_at desc
      `,
      sql<MessageDTO[]>`
        select id, channel_id as "channelId", content, attachments,
          sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
        from messages where organization_id = ${orgId} order by created_at asc
      `,
      sql<AgentRunLogDTO[]>`
        select
          id, agent_id as "agentId", runtime_id as "runtimeId",
          channel_id as "channelId", issue_id as "issueId",
          session_id as "sessionId", kind, prompt, response,
          created_at as "createdAt"
        from agent_run_logs where organization_id = ${orgId} order by created_at desc
      `
    ]);

    const visibleChannelIds = new Set(channels.map((c) => c.id));
    const visibleAgentIds = new Set(agents.map((a) => a.id));
    const visibleIssueChannelIds = new Set(issues.map((i) => i.discussionChannelId));

    return {
      organization,
      channels,
      runtimes,
      agents,
      agentActivities: [...(agentActivitiesByOrganization.get(orgId)?.values() ?? [])]
        .filter((activity) => visibleAgentIds.has(activity.agentId))
        .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
      agentRunLogs: agentRunLogs.filter(
        (log) => visibleAgentIds.has(log.agentId) && (!log.channelId || visibleChannelIds.has(log.channelId) || visibleIssueChannelIds.has(log.channelId))
      ),
      messages: messages.filter((message) => visibleChannelIds.has(message.channelId) || visibleIssueChannelIds.has(message.channelId)),
      issues,
      issueActivities
    } satisfies WorkspaceBootstrapPayload;
  }

  return {
    async initialize() {
      const schemaSql = await readSchemaSql();
      await sql.unsafe(schemaSql);

      const issuesMissingDiscussionChannels = await sql<Array<{ id: string; organizationId: string; createdAt: string }>>`
        select id, organization_id as "organizationId", created_at as "createdAt"
        from issues
        where discussion_channel_id is null
      `;

      for (const issue of issuesMissingDiscussionChannels) {
        const discussionChannelId = createId("ich");
        await sql.begin(async (transaction) => {
          await transaction`
            insert into channels (id, organization_id, type, name, description, created_at)
            values (${discussionChannelId}, ${issue.organizationId}, 'group', ${`issue-${issue.id.slice(-6)}`}, ${'Hidden issue discussion'}, ${issue.createdAt})
          `;
          await transaction`
            update issues
            set discussion_channel_id = ${discussionChannelId}
            where id = ${issue.id}
          `;
        });
      }
    },
    async seedDemoWorkspace() {
      await sql.unsafe(
        `
        insert into organizations (id, slug, name)
        values ('org_demo', 'org-demo', 'Org Demo')
        on conflict (id) do nothing;

        insert into users (id, email, password_hash)
        values ('usr_admin', 'admin@workpilot.local', 'demo-password')
        on conflict (id) do nothing;

        insert into users (id, email, password_hash)
        values ('usr_member', 'member@workpilot.local', 'demo-password')
        on conflict (id) do nothing;

        insert into memberships (organization_id, user_id, role)
        values ('org_demo', 'usr_admin', 'admin')
        on conflict (organization_id, user_id) do nothing;

        insert into memberships (organization_id, user_id, role)
        values ('org_demo', 'usr_member', 'member')
        on conflict (organization_id, user_id) do nothing;

        insert into channels (id, organization_id, type, name)
        values ('chn_general', 'org_demo', 'group', 'all')
        on conflict (id) do nothing;

        insert into channels (id, organization_id, type, name)
        values ('dir_admin_ops', 'org_demo', 'direct', 'Ada x Ops Bot')
        on conflict (id) do nothing;

        insert into channel_participants (channel_id, participant_id, participant_type)
        values ('chn_general', 'usr_admin', 'user')
        on conflict (channel_id, participant_id, participant_type) do nothing;

        insert into channel_participants (channel_id, participant_id, participant_type)
        values
          ('chn_general', 'usr_member', 'user'),
          ('chn_general', 'agt_seed', 'agent'),
          ('dir_admin_ops', 'usr_admin', 'user'),
          ('dir_admin_ops', 'agt_seed', 'agent')
        on conflict (channel_id, participant_id, participant_type) do nothing;

        insert into runtime_daemons (
          id,
          organization_id,
          name,
          runtime_key,
          status,
          credential_id,
          last_heartbeat_at,
          created_at
        )
        values (
          'rtm_seed',
          'org_demo',
          'Seed Runtime',
          'runtime_seed',
          'online',
          'cred_seed',
          '2025-01-01T00:00:00.000Z',
          '2025-01-01T00:00:00.000Z'
        )
        on conflict (id) do nothing;

        insert into agents (
          id,
          organization_id,
          runtime_id,
          channel_id,
          name,
          description,
          implementation,
          model,
          reasoning_effort,
          status
        )
        values (
          'agt_seed',
          'org_demo',
          'rtm_seed',
          'dir_admin_ops',
          'Ops Bot',
          'Monitor incidents, summarize impact, and propose next actions.',
          'claude',
          'default',
          'medium',
          'running'
        )
        on conflict (id) do nothing;

        insert into messages (
          id,
          organization_id,
          channel_id,
          sender_id,
          sender_type,
          content,
          attachments,
          created_at
        )
        values (
          'msg_seed',
          'org_demo',
          'chn_general',
          'usr_admin',
          'user',
          'Deployment health-check failed on production cluster.',
          '[]'::jsonb,
          '2025-01-01T00:00:00.000Z'
        )
        on conflict (id) do nothing;
      `
      );
    },
    async dispose() {
      try {
        sql.release();
      } finally {
        if (schema !== "public") {
          await pool.unsafe(`drop schema if exists "${schema}" cascade`);
        }
        await pool.close({ timeout: 0 });
      }
    },
    async getDemoSession() {
      return demoSession;
    },
    async getWorkspacesForUser(userId) {
      return sql<Array<{ id: string; name: string; slug: string }>>`
        select o.id, o.name, o.slug
        from organizations o
        join memberships m on m.organization_id = o.id
        where m.user_id = ${userId}
        order by o.created_at asc
      `;
    },
    async createWorkspace(input: CreateWorkspaceInput) {
      const name = input.name.trim();
      if (!name) {
        throw new Error("Workspace name is required.");
      }
      if (!/^[a-zA-Z0-9][a-zA-Z0-9 _-]*$/.test(name)) {
        throw new Error("Workspace name may only contain letters, digits, spaces, hyphens, and underscores.");
      }

      let slug = name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 32) || "workspace";
      let suffix = 1;

      while ((await sql<Array<{ id: string }>>`select id from organizations where slug = ${slug} limit 1`).length > 0) {
        suffix += 1;
        slug = `${slug}-${suffix}`;
      }

      const id = `org_${slug.replace(/-/g, "_")}`;
      const channelId = `chn_${slug.replace(/-/g, "_")}_general`;

      await sql.begin(async (transaction) => {
        await transaction`
          insert into users (id, email, password_hash)
          values (${input.userId}, ${`${input.userId}@workpilot.local`}, 'demo-password')
          on conflict (id) do nothing
        `;
        await transaction`
          insert into organizations (id, slug, name, description)
          values (${id}, ${slug}, ${name}, ${input.description?.trim() ?? ""})
        `;
        await transaction`
          insert into memberships (organization_id, user_id, role)
          values (${id}, ${input.userId}, 'owner')
        `;
        await transaction`
          insert into channels (id, organization_id, type, name, description)
          values (${channelId}, ${id}, 'group', 'all', 'General collaboration')
        `;
        await transaction`
          insert into channel_participants (channel_id, participant_id, participant_type)
          values (${channelId}, ${input.userId}, 'user')
        `;
      });

      return {
        id,
        name,
        slug
      };
    },
    async getOrganization(orgId) {
      return getOrganization(orgId);
    },
    async getChannel(channelId) {
      return getChannel(channelId);
    },
    async getChannels(orgId) {
      return getChannels(orgId);
    },
    async createChannel(input) {
      const name = input.name.trim().toLowerCase();
      const description = input.description?.trim() ? input.description.trim() : null;
      if (!name) {
        throw new Error("Channel name is required.");
      }

      const slug = name
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 24);
      let id = `chn_${slug || "channel"}`;
      let suffix = 1;

      while ((await sql<Array<{ id: string }>>`select id from channels where id = ${id} limit 1`).length > 0) {
        suffix += 1;
        id = `chn_${slug || "channel"}_${suffix}`;
      }

      const [channel] = await sql<Array<{ id: string; type: "group"; name: string; description: string | null }>>`
        insert into channels (id, organization_id, type, name, description)
        values (${id}, ${input.organizationId}, 'group', ${name}, ${description})
        returning id, type, name, description
      `;

      const participants = dedupeChannelParticipants([
        ...(input.actorId ? [{ participantId: input.actorId, participantType: "user" as const }] : []),
        ...(input.members ?? [])
      ]);

      if (participants.length > 0) {
        await sql.begin(async (transaction) => {
          for (const participant of participants) {
            await transaction`
              insert into channel_participants (channel_id, participant_id, participant_type)
              values (${channel.id}, ${participant.participantId}, ${participant.participantType})
              on conflict do nothing
            `;
          }
        });
      }

      return {
        ...channel,
        unreadCount: 0
      };
    },
    async getMessages(input) {
      return getMessages(input.channelId, input.after);
    },
    async getRuntimes(orgId) {
      return getRuntimes(orgId);
    },
    async getAgents(orgId) {
      return getAgents(orgId);
    },
    async getWorkspaceBootstrap(orgId) {
      return buildWorkspaceBootstrap(orgId);
    },
    async getWorkspaceBootstrapForRuntime(runtimeId) {
      const [runtime] = await sql<Array<{ organizationId: string }>>`
        select organization_id as "organizationId"
        from runtime_daemons
        where id = ${runtimeId}
        limit 1
      `;

      if (!runtime) {
        return {
          organization: null,
          channels: [],
          runtimes: [],
          agents: [],
          agentActivities: [],
          agentRunLogs: [],
          messages: [],
          issues: [],
          issueActivities: []
        } satisfies WorkspaceBootstrapPayload;
      }

      return buildWorkspaceBootstrap(runtime.organizationId);
    },
    async getWorkspaceBootstrapForChannel(channelId) {
      const [channel] = await sql<Array<{ organizationId: string }>>`
        select organization_id as "organizationId"
        from channels
        where id = ${channelId}
        limit 1
      `;

      if (!channel) {
        return {
          organization: null,
          channels: [],
          runtimes: [],
          agents: [],
          agentActivities: [],
          agentRunLogs: [],
          messages: [],
          issues: [],
          issueActivities: []
        } satisfies WorkspaceBootstrapPayload;
      }

      return buildWorkspaceBootstrap(channel.organizationId);
    },
    async getAgentIdsForRuntime(runtimeId) {
      const rows = await sql<Array<{ id: string }>>`
        select id from agents where runtime_id = ${runtimeId}
      `;
      return rows.map((r) => r.id);
    },
    async getAgentsForChannel(channelId) {
      return sql<AgentIdentity[]>`
        select
          a.id, a.name, a.description, a.implementation, a.model,
          a.reasoning_effort as "reasoningEffort", a.status,
          a.runtime_id as "runtimeId", a.channel_id as "channelId",
          a.organization_id as "organizationId"
        from agents a
        where a.channel_id = ${channelId}
      `;
    },
    async getAgentActivitiesForAgents(agentIds) {
      if (agentIds.length === 0) return [];
      // Agent activities are stored in-memory, not in postgres
      const results: AgentActivityDTO[] = [];
      for (const [, activities] of agentActivitiesByOrganization) {
        for (const activity of activities.values()) {
          if (agentIds.includes(activity.agentId)) {
            results.push(activity);
          }
        }
      }
      return results.sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt));
    },
    async getAgentRunLogsForChannel(channelId, after) {
      if (after) {
        return sql<AgentRunLogDTO[]>`
          select
            id, agent_id as "agentId", runtime_id as "runtimeId",
            channel_id as "channelId", issue_id as "issueId",
            session_id as "sessionId", kind, prompt, response,
            created_at as "createdAt"
          from agent_run_logs
          where channel_id = ${channelId} and created_at > ${after}
          order by created_at desc
        `;
      }
      return sql<AgentRunLogDTO[]>`
        select
          id, agent_id as "agentId", runtime_id as "runtimeId",
          channel_id as "channelId", issue_id as "issueId",
          session_id as "sessionId", kind, prompt, response,
          created_at as "createdAt"
        from agent_run_logs
        where channel_id = ${channelId}
        order by created_at desc
      `;
    },
    async createRuntimeRegistrationCommand(input) {
      if (input.actorRole !== "owner" && input.actorRole !== "admin") {
        throw new Error("Only organization owners or admins can register runtime daemons.");
      }
      const token = createSecret("wpt");
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      await sql`
        insert into runtime_registration_tokens (id, organization_id, token, created_by, expires_at)
        values (${createId("rrt")}, ${input.organizationId}, ${token}, ${input.actorId}, ${expiresAt})
      `;

      return {
        token,
        expiresAt,
        controlPlaneUrl: input.controlPlaneUrl,
        installCommand: [
          "bun run --cwd apps/agent-daemon start --",
          `--control-plane-url ${input.controlPlaneUrl}`,
          `--registration-token ${token}`
        ].join(" ")
      };
    },
    async registerRuntime(input) {
      const [tokenRow] = await sql<
        Array<{ organization_id: string; expires_at: string; used_at: string | null; used_runtime_key: string | null }>
      >`
        select organization_id, expires_at, used_at, used_runtime_key
        from runtime_registration_tokens
        where token = ${input.registrationToken}
        limit 1
      `;

      if (!tokenRow) {
        throw new Error("Registration token is invalid.");
      }
      if (tokenRow.used_at && tokenRow.used_runtime_key !== input.runtimeKey) {
        throw new Error("Registration token has already been used.");
      }
      if (Date.parse(tokenRow.expires_at) < Date.now()) {
        throw new Error("Registration token has expired.");
      }

      const now = new Date().toISOString();
      return await sql.begin(async (transaction) => {
        const [lockedToken] = await transaction<
          Array<{ organization_id: string; expires_at: string; used_at: string | null; used_runtime_key: string | null }>
        >`
          select organization_id, expires_at, used_at, used_runtime_key
          from runtime_registration_tokens
          where token = ${input.registrationToken}
          for update
        `;

        if (!lockedToken) {
          throw new Error("Registration token is invalid.");
        }
        if (lockedToken.used_at && lockedToken.used_runtime_key !== input.runtimeKey) {
          throw new Error("Registration token has already been used.");
        }
        if (Date.parse(lockedToken.expires_at) < Date.parse(now)) {
          throw new Error("Registration token has expired.");
        }

        const [existingRuntime] = await transaction<
          Array<{ id: string; name: string; status: string; credentialId: string; lastHeartbeatAt: string | null }>
        >`
          select
            id,
            name,
            status,
            credential_id as "credentialId",
            last_heartbeat_at as "lastHeartbeatAt"
          from runtime_daemons
          where organization_id = ${lockedToken.organization_id}
            and runtime_key = ${input.runtimeKey}
            and status <> 'deleted'
          limit 1
        `;

        await transaction`
          update runtime_registration_tokens
          set used_at = coalesce(used_at, ${now}),
              used_runtime_key = coalesce(used_runtime_key, ${input.runtimeKey})
          where token = ${input.registrationToken}
        `;

        if (existingRuntime) {
          return existingRuntime;
        }

        const id = createId("rtm");
        const credentialId = createSecret("cred");
        const [createdRuntime] = await transaction<
          Array<{ id: string; name: string; status: string; credentialId: string; lastHeartbeatAt: string | null }>
        >`
          insert into runtime_daemons (id, organization_id, name, runtime_key, status, credential_id, last_heartbeat_at, created_at)
          values (${id}, ${lockedToken.organization_id}, ${input.runtimeName}, ${input.runtimeKey}, 'pending', ${credentialId}, null, ${now})
          returning
            id,
            name,
            status,
            credential_id as "credentialId",
            last_heartbeat_at as "lastHeartbeatAt"
        `;

        return createdRuntime!;
      });
    },
    async recordRuntimeHeartbeat(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [runtime] = await sql<
        Array<{ id: string; status: string; lastHeartbeatAt: string | null }>
      >`
        update runtime_daemons
        set status = 'online', last_heartbeat_at = ${occurredAt}
        where id = ${input.runtimeId}
        returning id, status, last_heartbeat_at as "lastHeartbeatAt"
      `;
      if (!runtime) {
        throw new Error("Runtime daemon was not found.");
      }
      return runtime;
    },
    async deleteRuntime(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [runtime] = await sql<Array<{ id: string; name: string }>>`
        select id, name
        from runtime_daemons
        where id = ${input.runtimeId}
        limit 1
      `;
      if (!runtime) {
        throw new Error("Runtime daemon was not found.");
      }

      await sql.begin(async (transaction) => {
        const runtimeAgentIds = await transaction<Array<{ id: string }>>`
          update agents
          set status = 'deleted'
          where runtime_id = ${input.runtimeId}
          returning id
        `;

        if (runtimeAgentIds.length > 0) {
          await transaction`
            update issues
            set assignee_id = null, updated_at = ${occurredAt}
            where assignee_id in ${transaction(runtimeAgentIds.map((agent) => agent.id))}
          `;
        }

        await transaction`
          update runtime_daemons
          set status = 'deleted', last_heartbeat_at = ${occurredAt}
          where id = ${input.runtimeId}
        `;

        await transaction`
          insert into audit_logs (id, organization_id, action, actor_id, target_id, created_at)
          values (
            ${createId("log")},
            (select organization_id from runtime_daemons where id = ${input.runtimeId}),
            'runtime.deleted',
            ${input.actorId},
            ${input.runtimeId},
            ${occurredAt}
          )
        `;
      });

      return {
        runtime: {
          id: runtime.id,
          name: runtime.name,
          status: "deleted"
        }
      };
    },
    async createAgent(input) {
      const [runtime] = await sql<Array<{ organization_id: string }>>`
        select organization_id
        from runtime_daemons
        where id = ${input.runtimeId}
        limit 1
      `;
      if (!runtime) {
        throw new Error("Runtime daemon was not found.");
      }

      const agentId = createId("agt");
      const channelId = createId("dir");
      const channelName = `Ada x ${input.name}`;
      const [agent] = await sql<Array<AgentIdentity & { organizationId: string }>>`
        with created_channel as (
          insert into channels (id, organization_id, type, name)
          values (${channelId}, ${runtime.organization_id}, 'direct', ${channelName})
          returning id
        ),
        created_agent as (
          insert into agents (id, organization_id, runtime_id, channel_id, name, description, implementation, model, reasoning_effort, status)
          values (
            ${agentId},
            ${runtime.organization_id},
            ${input.runtimeId},
            ${channelId},
            ${input.name},
            ${input.description},
            ${input.implementation ?? "claude"},
            ${input.model ?? "default"},
            ${input.reasoningEffort ?? "medium"},
            'running'
          )
          returning id, runtime_id as "runtimeId", channel_id as "channelId", name, description, implementation, model, reasoning_effort as "reasoningEffort", status
        ),
        participants as (
          insert into channel_participants (channel_id, participant_id, participant_type)
          values
            (${channelId}, 'usr_admin', 'user'),
            (${channelId}, ${agentId}, 'agent')
          on conflict (channel_id, participant_id, participant_type) do nothing
          returning channel_id
        )
        select * from created_agent
      `;
      return agent;
    },
    async ensureAgentDirectChannel(input) {
      const [agent] = await sql<Array<{ id: string; organization_id: string; name: string }>>`
        select id, organization_id, name
        from agents
        where id = ${input.agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const [existingChannel] = await sql<Array<{ id: string; type: "direct"; name: string }>>`
        select c.id, c.type, c.name
        from channels c
        join channel_participants user_participant
          on user_participant.channel_id = c.id
         and user_participant.participant_type = 'user'
         and user_participant.participant_id = ${input.userId}
        join channel_participants agent_participant
          on agent_participant.channel_id = c.id
         and agent_participant.participant_type = 'agent'
         and agent_participant.participant_id = ${input.agentId}
        where c.type = 'direct'
        limit 1
      `;

      if (existingChannel) {
        return {
          ...existingChannel,
          unreadCount: 0
        };
      }

      const channelId = createId("dir");
      const channelName = `${input.userId} x ${agent.name}`;
      const [channel] = await sql<Array<{ id: string; type: "direct"; name: string }>>`
        with created_channel as (
          insert into channels (id, organization_id, type, name)
          values (${channelId}, ${agent.organization_id}, 'direct', ${channelName})
          returning id, type, name
        ),
        participants as (
          insert into channel_participants (channel_id, participant_id, participant_type)
          values
            (${channelId}, ${input.userId}, 'user'),
            (${channelId}, ${input.agentId}, 'agent')
          on conflict (channel_id, participant_id, participant_type) do nothing
          returning channel_id
        )
        select id, type, name from created_channel
      `;

      return {
        ...channel,
        unreadCount: 0
      };
    },
    async controlAgent(input) {
      const [agentRow] = await sql<
        Array<{
          id: string;
          organization_id: string;
          runtime_id: string;
          channel_id: string;
          name: string;
          description: string;
          implementation: AgentIdentity["implementation"];
          model: string;
          reasoning_effort: AgentIdentity["reasoningEffort"];
          status: AgentIdentity["status"];
        }>
      >`
        select id, organization_id, runtime_id, channel_id, name, description, implementation, model, reasoning_effort, status
        from agents
        where id = ${input.agentId}
        limit 1
      `;
      if (!agentRow) {
        throw new Error("Agent was not found.");
      }

      const requestedAt = input.occurredAt ?? new Date().toISOString();
      const actionId = createId("aca");
      let agent: AgentIdentity | null = null;

      await sql.begin(async (transaction) => {
        if (input.action === "start" || input.action === "stop") {
          const [updatedAgent] = await transaction<AgentIdentity[]>`
            update agents
            set status = ${input.action === "start" ? "running" : "stopped"}
            where id = ${input.agentId}
            returning id, runtime_id as "runtimeId", channel_id as "channelId", name, description, implementation, model, reasoning_effort as "reasoningEffort", status
          `;
          agent = updatedAgent ?? null;
        } else if (input.action === "delete") {
          await transaction`delete from agents where id = ${input.agentId}`;
        } else {
          agent = {
            id: agentRow.id,
            runtimeId: agentRow.runtime_id,
            channelId: agentRow.channel_id,
            name: agentRow.name,
            description: agentRow.description,
            implementation: agentRow.implementation,
            model: agentRow.model,
            reasoningEffort: agentRow.reasoning_effort,
            status: agentRow.status
          };
        }

        await transaction`
          insert into agent_control_actions (id, organization_id, runtime_id, agent_id, action, restart_mode, requested_at)
          values (${actionId}, ${agentRow.organization_id}, ${agentRow.runtime_id}, ${input.agentId}, ${input.action}, ${input.restartMode ?? null}, ${requestedAt})
        `;
      });

      return {
        agent,
        controlAction: {
          id: actionId,
          runtimeId: agentRow.runtime_id,
          agentId: input.agentId,
          action: input.action,
          restartMode: input.restartMode ?? null,
          requestedAt,
          acknowledgedAt: null
        }
      };
    },
    async getRuntimeControlActions(runtimeId) {
      return sql<AgentControlActionDTO[]>`
        select
          id,
          runtime_id as "runtimeId",
          agent_id as "agentId",
          action,
          restart_mode as "restartMode",
          requested_at as "requestedAt",
          acknowledged_at as "acknowledgedAt"
        from agent_control_actions
        where runtime_id = ${runtimeId}
          and acknowledged_at is null
        order by requested_at asc
      `;
    },
    async acknowledgeAgentControlAction(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [action] = await sql<AgentControlActionDTO[]>`
        update agent_control_actions
        set acknowledged_at = ${occurredAt}
        where id = ${input.actionId}
        returning
          id,
          runtime_id as "runtimeId",
          agent_id as "agentId",
          action,
          restart_mode as "restartMode",
          requested_at as "requestedAt",
          acknowledged_at as "acknowledgedAt"
      `;
      if (!action) {
        throw new Error("Agent control action was not found.");
      }
      return action;
    },
    async createMessage(input) {
      const [channel] = await sql<Array<{ organization_id: string }>>`
        select organization_id from channels where id = ${input.channelId} limit 1
      `;
      if (!channel) {
        throw new Error("Channel not found.");
      }
      const attachments = (input.attachments ?? []).map((attachment) => ({
        id: createId("att"),
        ...attachment
      }));
      const [message] = await sql<MessageDTO[]>`
        insert into messages (id, organization_id, channel_id, sender_id, sender_type, content, attachments, created_at)
        values (${createId("msg")}, ${channel.organization_id}, ${input.channelId}, ${input.senderId}, ${input.senderType}, ${input.content}, ${JSON.stringify(attachments)}::jsonb, ${input.occurredAt ?? new Date().toISOString()})
        returning id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
      `;
      return message;
    },
    async createIssue(input) {
      const [channel] = input.sourceChannelId
        ? await sql<Array<{ organization_id: string }>>`
            select organization_id from channels where id = ${input.sourceChannelId} limit 1
          `
        : await sql<Array<{ organization_id: string }>>`
            select organization_id from memberships where user_id = ${input.actorId} limit 1
          `;
      if (!channel) {
        throw new Error("Source channel was not found.");
      }
      const createdAt = new Date().toISOString();
      const issueId = createId("iss");
      const discussionChannelId = createId("ich");
      const [issue] = await sql.begin(async (transaction) => {
        await transaction`
          insert into channels (id, organization_id, type, name, description, created_at)
          values (${discussionChannelId}, ${channel.organization_id}, 'group', ${`issue-${issueId.slice(-6)}`}, ${'Hidden issue discussion'}, ${createdAt})
        `;
        const rows = await transaction<IssueDTO[]>`
          insert into issues (
            id,
            organization_id,
            title,
            description,
            status,
            assignee_id,
            creator_id,
            priority,
            due_date,
            project,
            source_channel_id,
            discussion_channel_id,
            created_at,
            updated_at
          )
          values (
            ${issueId},
            ${channel.organization_id},
            ${input.title},
            ${input.description},
            ${input.status ?? "backlog"},
            ${input.assigneeId},
            ${input.actorId},
            ${input.priority ?? "medium"},
            ${input.dueDate ?? null},
            ${input.project ?? null},
            ${input.sourceChannelId ?? null},
            ${discussionChannelId},
            ${createdAt},
            ${createdAt}
          )
          returning
            id,
            title,
            description,
            status,
            assignee_id as "assigneeId",
            creator_id as "creatorId",
            priority,
            due_date as "dueDate",
            project,
            source_channel_id as "sourceChannelId",
            discussion_channel_id as "discussionChannelId",
            created_at as "createdAt",
            updated_at as "updatedAt"
        `;
        await insertIssueActivity(transaction, {
          organizationId: channel.organization_id,
          issueId,
          actorId: input.actorId,
          actorType: "user",
          kind: "created",
          field: null,
          fromValue: null,
          toValue: input.status ?? "backlog",
          message: input.description || null,
          createdAt
        });
        return rows;
      });
      return issue;
    },
    async updateIssue(input) {
      return await updateIssueWithActivities(sql, input);
    },
    async deleteIssue(input) {
      const [issue] = await sql<Array<{ id: string }>>`
        delete from issues
        where id = ${input.issueId}
        returning id
      `;

      if (!issue) {
        throw new Error("Issue was not found.");
      }

      return { issueId: issue.id };
    },
    async createIssueComment(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [issue] = await sql<Array<{ organizationId: string }>>`
        select organization_id as "organizationId"
        from issues
        where id = ${input.issueId}
        limit 1
      `;

      if (!issue) {
        throw new Error("Issue was not found.");
      }

      const activityId = createId("isa");
      await sql.begin(async (transaction) => {
        await insertIssueActivity(transaction, {
          id: activityId,
          organizationId: issue.organizationId,
          issueId: input.issueId,
          actorId: input.actorId,
          actorType: input.actorType,
          kind: "commented",
          field: null,
          fromValue: null,
          toValue: null,
          message: input.message.trim(),
          createdAt: occurredAt
        });
        await transaction`
          update issues
          set updated_at = ${occurredAt}
          where id = ${input.issueId}
        `;
      });

      return mapIssueActivityRow({
        id: activityId,
        issueId: input.issueId,
        actorId: input.actorId,
        actorType: input.actorType,
        kind: "commented",
        field: null,
        fromValue: null,
        toValue: null,
        message: input.message.trim(),
        createdAt: occurredAt
      });
    },
    async getIssueActivities(issueId) {
      const [issue] = await sql<Array<{ organizationId: string }>>`
        select organization_id as "organizationId"
        from issues
        where id = ${issueId}
        limit 1
      `;

      if (!issue) {
        throw new Error("Issue was not found.");
      }

      const activities = await sql<IssueActivityDTO[]>`
        select
          id,
          issue_id as "issueId",
          actor_id as "actorId",
          actor_type as "actorType",
          kind,
          field,
          from_value as "fromValue",
          to_value as "toValue",
          message,
          created_at as "createdAt"
        from issue_activities
        where issue_id = ${issueId}
        order by created_at desc
      `;

      return activities;
    },
    async createIssueFromMessage(input: CreateIssueFromMessageInput) {
      const [message] = await sql<Array<{ organization_id: string; channel_id: string }>>`
        select organization_id, channel_id
        from messages
        where id = ${input.messageId}
        limit 1
      `;
      if (!message) {
        throw new Error("Source message was not found.");
      }
      const createdAt = new Date().toISOString();
      const issueId = createId("iss");
      const discussionChannelId = createId("ich");
      const [issue] = await sql.begin(async (transaction) => {
        await transaction`
          insert into channels (id, organization_id, type, name, description, created_at)
          values (${discussionChannelId}, ${message.organization_id}, 'group', ${`issue-${issueId.slice(-6)}`}, ${'Hidden issue discussion'}, ${createdAt})
        `;
        const rows = await transaction<IssueDTO[]>`
        insert into issues (
          id,
          organization_id,
          title,
          description,
          status,
          assignee_id,
          creator_id,
          priority,
          due_date,
          project,
          source_channel_id,
          discussion_channel_id,
          created_at,
          updated_at
        )
        values (
          ${issueId},
          ${message.organization_id},
          ${input.title},
          ${input.description ?? ""},
          ${input.assigneeId ? "todo" : "backlog"},
          ${input.assigneeId},
          ${input.actorId},
          ${input.priority ?? "medium"},
          ${input.dueDate ?? null},
          ${input.project ?? null},
          ${message.channel_id},
          ${discussionChannelId},
          ${createdAt},
          ${createdAt}
        )
        returning
          id,
          title,
          description,
          status,
          assignee_id as "assigneeId",
          creator_id as "creatorId",
          priority,
          due_date as "dueDate",
          project,
          source_channel_id as "sourceChannelId",
          discussion_channel_id as "discussionChannelId",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
        await insertIssueActivity(transaction, {
          organizationId: message.organization_id,
          issueId,
          actorId: input.actorId,
          actorType: "user",
          kind: "created",
          field: null,
          fromValue: null,
          toValue: input.assigneeId ? "todo" : "backlog",
          message: input.description?.trim() || null,
          createdAt
        });
        return rows;
      });
      return issue;
    },
    async createIssueFromMessages(input: CreateIssueFromMessagesInput) {
      if (input.messageIds.length === 0) {
        throw new Error("Source message was not found.");
      }

      const messages = await sql<Array<{ id: string; organization_id: string; channel_id: string }>>`
        select id, organization_id, channel_id
        from messages
        where id = any(${input.messageIds})
      `;

      if (messages.length !== input.messageIds.length) {
        throw new Error("Source message was not found.");
      }

      const [firstMessage] = messages;
      if (messages.some((message) => message.channel_id !== firstMessage.channel_id)) {
        throw new Error("All source messages must belong to the same channel.");
      }

      const createdAt = new Date().toISOString();
      const issueId = createId("iss");
      const discussionChannelId = createId("ich");
      const [issue] = await sql.begin(async (transaction) => {
        await transaction`
          insert into channels (id, organization_id, type, name, description, created_at)
          values (${discussionChannelId}, ${firstMessage.organization_id}, 'group', ${`issue-${issueId.slice(-6)}`}, ${'Hidden issue discussion'}, ${createdAt})
        `;
        const rows = await transaction<IssueDTO[]>`
        insert into issues (
          id,
          organization_id,
          title,
          description,
          status,
          assignee_id,
          creator_id,
          priority,
          due_date,
          project,
          source_channel_id,
          discussion_channel_id,
          created_at,
          updated_at
        )
        values (
          ${issueId},
          ${firstMessage.organization_id},
          ${input.title},
          ${input.description},
          ${input.assigneeId ? "todo" : "backlog"},
          ${input.assigneeId},
          ${input.actorId},
          ${input.priority ?? "medium"},
          ${input.dueDate ?? null},
          ${input.project ?? null},
          ${firstMessage.channel_id},
          ${discussionChannelId},
          ${createdAt},
          ${createdAt}
        )
        returning
          id,
          title,
          description,
          status,
          assignee_id as "assigneeId",
          creator_id as "creatorId",
          priority,
          due_date as "dueDate",
          project,
          source_channel_id as "sourceChannelId",
          discussion_channel_id as "discussionChannelId",
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
        await insertIssueActivity(transaction, {
          organizationId: firstMessage.organization_id,
          issueId,
          actorId: input.actorId,
          actorType: "user",
          kind: "created",
          field: null,
          fromValue: null,
          toValue: input.assigneeId ? "todo" : "backlog",
          message: input.description?.trim() || null,
          createdAt
        });
        return rows;
      });
      return issue;
    },
    async pullRuntimeIssues(input) {
      const claimedIssues = await sql<
        Array<
          IssueDTO & {
            organizationId: string;
            agentId: string;
            agentChannelId: string;
            agentName: string;
            agentDescription: string;
            agentImplementation: AgentIdentity["implementation"];
            agentModel: string;
            agentReasoningEffort: AgentIdentity["reasoningEffort"];
            agentStatus: AgentIdentity["status"];
          }
        >
      >`
        with candidate_issues as (
          select i.id
          from issues i
          join agents a on a.id = i.assignee_id
          where a.runtime_id = ${input.runtimeId}
            and a.status = 'running'
            and i.status = 'todo'
          order by i.created_at asc
          limit ${input.limit ?? 20}
        ),
        updated_issues as (
          update issues i
          set status = 'in_progress', updated_at = now()
          where i.id in (select id from candidate_issues)
          returning
            i.id,
            i.organization_id as "organizationId",
            i.title,
            i.description,
            i.status,
            i.assignee_id as "assigneeId",
            i.creator_id as "creatorId",
            i.priority,
            i.due_date as "dueDate",
            i.project,
            i.source_channel_id as "sourceChannelId",
            i.created_at as "createdAt",
            i.updated_at as "updatedAt"
        )
        select
          u.*,
          a.id as "agentId",
          a.channel_id as "agentChannelId",
          a.name as "agentName",
          a.description as "agentDescription",
          a.implementation as "agentImplementation",
          a.model as "agentModel",
          a.reasoning_effort as "agentReasoningEffort",
          a.status as "agentStatus"
        from updated_issues u
        join agents a on a.id = u."assigneeId"
        order by u."createdAt" asc
      `;

      if (claimedIssues.length === 0) {
        return [];
      }

      for (const issue of claimedIssues) {
        await insertIssueActivity(sql, {
          organizationId: issue.organizationId,
          issueId: issue.id,
          actorId: issue.assigneeId ?? input.runtimeId,
          actorType: issue.assigneeId ? "agent" : "system",
          kind: "status_changed",
          field: "status",
          fromValue: "todo",
          toValue: "in_progress",
          message: "Claimed from the runtime issue queue.",
          createdAt: issue.updatedAt
        });
      }

      const sourceChannelIds = [
        ...new Set(claimedIssues.map((issue) => issue.sourceChannelId).filter((channelId): channelId is string => Boolean(channelId)))
      ];
      const claimedIssueIds = claimedIssues.map((issue) => issue.id);
      const issueActivities = await sql<IssueActivityDTO[]>`
        select
          id,
          issue_id as "issueId",
          actor_id as "actorId",
          actor_type as "actorType",
          kind,
          field,
          from_value as "fromValue",
          to_value as "toValue",
          message,
          created_at as "createdAt"
        from issue_activities
        where issue_id = any(${toPostgresTextArray(claimedIssueIds)}::text[])
        order by created_at asc
      `;
      const issueActivitiesByIssueId = new Map<string, IssueActivityDTO[]>();
      for (const activity of issueActivities) {
        const current = issueActivitiesByIssueId.get(activity.issueId) ?? [];
        current.push(activity);
        issueActivitiesByIssueId.set(activity.issueId, current);
      }
      const sourceMessages = await sql<MessageDTO[]>`
        select id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
        from messages
        where channel_id = any(${toPostgresTextArray(sourceChannelIds)}::text[])
        order by created_at asc
      `;
      const sourceMessagesByChannelId = new Map<string, MessageDTO[]>();
      for (const message of sourceMessages) {
        const current = sourceMessagesByChannelId.get(message.channelId) ?? [];
        current.push(message);
        sourceMessagesByChannelId.set(message.channelId, current);
      }

      return claimedIssues.map((issue): RuntimeIssueClaimDTO => ({
        issue: {
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
        },
        agent: {
          id: issue.agentId,
          runtimeId: input.runtimeId,
          channelId: issue.agentChannelId,
          name: issue.agentName,
          description: issue.agentDescription,
          implementation: issue.agentImplementation,
          model: issue.agentModel,
          reasoningEffort: issue.agentReasoningEffort,
          status: issue.agentStatus
        },
        sourceMessages: issue.sourceChannelId ? (sourceMessagesByChannelId.get(issue.sourceChannelId) ?? []) : [],
        issueActivities: issueActivitiesByIssueId.get(issue.id) ?? []
      }));
    },
    async recordAgentIssueEvent(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [agent] = await sql<AgentIdentity[]>`
        select
          id,
          organization_id as "organizationId",
          runtime_id as "runtimeId",
          channel_id as "channelId",
          name,
          description,
          implementation,
          model,
          reasoning_effort as "reasoningEffort",
          status
        from agents
        where id = ${input.agentId}
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      let issue: IssueDTO | null = null;
      let message: MessageDTO | null = null;

      await sql.begin(async (transaction) => {
        const [currentIssue] = await transaction<IssueDTO[]>`
          select
            id,
            title,
            description,
            status,
            assignee_id as "assigneeId",
            creator_id as "creatorId",
            priority,
            due_date as "dueDate",
            project,
            source_channel_id as "sourceChannelId",
            created_at as "createdAt",
            updated_at as "updatedAt"
          from issues
          where id = ${input.issueId}
          limit 1
        `;
        if (!currentIssue) {
          throw new Error("Issue was not found.");
        }

        const [updatedIssue] = await transaction<IssueDTO[]>`
          update issues
          set status = ${input.status}, updated_at = ${occurredAt}
          where id = ${input.issueId}
          returning
            id,
            title,
            description,
            status,
            assignee_id as "assigneeId",
            creator_id as "creatorId",
            priority,
            due_date as "dueDate",
            project,
            source_channel_id as "sourceChannelId",
            created_at as "createdAt",
            updated_at as "updatedAt"
        `;
        if (currentIssue.status !== updatedIssue.status) {
          await insertIssueActivity(transaction, {
            organizationId: agent.organizationId,
            issueId: input.issueId,
            actorId: input.agentId,
            actorType: "agent",
            kind: "status_changed",
            field: "status",
            fromValue: currentIssue.status,
            toValue: updatedIssue.status,
            message: null,
            createdAt: occurredAt
          });
        }
        issue = updatedIssue;

        if (input.message && input.message.trim().length > 0) {
          await insertIssueActivity(transaction, {
            organizationId: agent.organizationId,
            issueId: input.issueId,
            actorId: input.agentId,
            actorType: "agent",
            kind: "commented",
            field: null,
            fromValue: null,
            toValue: null,
            message: input.message.trim(),
            createdAt: occurredAt
          });
          const [createdMessage] = await transaction<MessageDTO[]>`
            insert into messages (id, organization_id, channel_id, sender_id, sender_type, content, attachments, created_at)
            select ${createId("msg")}, organization_id, discussion_channel_id, ${input.agentId}, 'agent', ${input.message.trim()}, '[]'::jsonb, ${occurredAt}
            from issues
            where id = ${input.issueId}
            returning id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
          `;
          message = createdMessage ?? null;
        }
      });

      return {
        issue: issue!,
        message
      };
    },
    async recordAgentActivity(input) {
      const [agent] = await sql<Array<{ id: string; organizationId: string }>>`
        select id, organization_id as "organizationId"
        from agents
        where id = ${input.agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const activities = agentActivitiesByOrganization.get(agent.organizationId) ?? new Map<string, AgentActivityDTO>();
      const activity: AgentActivityDTO = {
        agentId: input.agentId,
        status: input.status,
        summary: input.summary,
        detail: input.detail ?? null,
        updatedAt: input.occurredAt ?? new Date().toISOString()
      };
      activities.set(input.agentId, activity);
      agentActivitiesByOrganization.set(agent.organizationId, activities);

      return {
        activity
      };
    },
    async recordAgentRunLog(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [agent] = await sql<Array<{ id: string; organizationId: string }>>`
        select id, organization_id as "organizationId"
        from agents
        where id = ${input.agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const [log] = await sql<AgentRunLogDTO[]>`
        insert into agent_run_logs (
          id,
          organization_id,
          runtime_id,
          agent_id,
          channel_id,
          issue_id,
          session_id,
          kind,
          prompt,
          response,
          created_at
        )
        values (
          ${createId("arl")},
          ${agent.organizationId},
          ${input.runtimeId},
          ${input.agentId},
          ${input.channelId ?? null},
          ${input.issueId ?? null},
          ${input.sessionId},
          ${input.kind},
          ${input.prompt},
          ${input.response},
          ${occurredAt}
        )
        returning
          id,
          agent_id as "agentId",
          runtime_id as "runtimeId",
          channel_id as "channelId",
          issue_id as "issueId",
          session_id as "sessionId",
          kind,
          prompt,
          response,
          created_at as "createdAt"
      `;

      return {
        log
      };
    },
    async syncAgentWorkspaceFiles(input) {
      const [agent] = await sql<Array<{ id: string; organizationId: string }>>`
        select id, organization_id as "organizationId"
        from agents
        where id = ${input.agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      await sql`
        delete from agent_workspace_files
        where agent_id = ${input.agentId}
      `;

      for (const file of input.files) {
        await sql`
          insert into agent_workspace_files (
            agent_id,
            organization_id,
            path,
            content,
            size,
            updated_at
          )
          values (
            ${input.agentId},
            ${agent.organizationId},
            ${file.path},
            ${file.content},
            ${file.size},
            ${file.updatedAt}
          )
        `;
      }

      return {
        files: input.files
          .map(({ content: _content, ...file }) => file)
          .sort((left, right) => left.path.localeCompare(right.path))
      };
    },
    async listAgentWorkspaceFiles(agentId) {
      const [agent] = await sql<Array<{ id: string }>>`
        select id
        from agents
        where id = ${agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      return await sql<Array<{ path: string; kind: "file"; size: number; updatedAt: string }>>`
        select
          path,
          'file' as kind,
          size,
          updated_at as "updatedAt"
        from agent_workspace_files
        where agent_id = ${agentId}
        order by path asc
      `;
    },
    async getAgentWorkspaceFile(agentId, path) {
      const [agent] = await sql<Array<{ id: string }>>`
        select id
        from agents
        where id = ${agentId}
          and status <> 'deleted'
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const [file] = await sql<AgentWorkspaceFileContentDTO[]>`
        select
          path,
          'file' as kind,
          size,
          updated_at as "updatedAt",
          content
        from agent_workspace_files
        where agent_id = ${agentId}
          and path = ${path}
        limit 1
      `;

      return file ?? null;
    },
    async pullRuntimeAgentMessages(input) {
      const claimedAt = input.occurredAt ?? new Date().toISOString();
      const claims = await sql<
        Array<{
          agentId: string;
          agentRuntimeId: string;
          agentChannelId: string;
          agentName: string;
          agentDescription: string;
          agentImplementation: AgentIdentity["implementation"];
          agentModel: string;
          agentReasoningEffort: AgentIdentity["reasoningEffort"];
          agentStatus: AgentIdentity["status"];
          sourceMessageId: string;
          sourceChannelId: string;
          sourceContent: string;
          sourceAttachments: MessageDTO["attachments"];
          sourceSenderId: string;
          sourceSenderType: MessageDTO["senderType"];
          sourceCreatedAt: string;
          isFirstUserMessage: boolean;
        }>
      >`
        with candidate_messages as (
          select
            m.id as source_message_id,
            a.id as agent_id
          from messages m
          join channel_participants cp
            on cp.channel_id = m.channel_id
           and cp.participant_type = 'agent'
          join agents a on a.id = cp.participant_id
          join channels c on c.id = m.channel_id
          where a.runtime_id = ${input.runtimeId}
            and a.status = 'running'
            and m.sender_type = 'user'
            and (
              c.type = 'direct'
              or strpos(lower(m.content), lower(concat('@', a.name))) > 0
            )
            and not exists (
              select 1
              from agent_message_claims amc
              where amc.source_message_id = m.id
            )
          order by m.created_at asc
          limit ${input.limit ?? 20}
        ),
        inserted_claims as (
          insert into agent_message_claims (
            id,
            organization_id,
            runtime_id,
            agent_id,
            source_message_id,
            claimed_at
          )
          select
            concat('amc_', substr(md5(c.source_message_id || ${claimedAt}), 1, 12)),
            a.organization_id,
            a.runtime_id,
            c.agent_id,
            c.source_message_id,
            ${claimedAt}
          from candidate_messages c
          join agents a on a.id = c.agent_id
          on conflict (source_message_id) do nothing
          returning agent_id, source_message_id
        )
        select
          a.id as "agentId",
          a.runtime_id as "agentRuntimeId",
          a.channel_id as "agentChannelId",
          a.name as "agentName",
          a.description as "agentDescription",
          a.implementation as "agentImplementation",
          a.model as "agentModel",
          a.reasoning_effort as "agentReasoningEffort",
          a.status as "agentStatus",
          m.id as "sourceMessageId",
          m.channel_id as "sourceChannelId",
          m.content as "sourceContent",
          m.attachments as "sourceAttachments",
          m.sender_id as "sourceSenderId",
          m.sender_type as "sourceSenderType",
          m.created_at as "sourceCreatedAt",
          not exists (
            select 1
            from messages earlier
            where earlier.channel_id = m.channel_id
              and earlier.sender_type = 'user'
              and earlier.created_at < m.created_at
          ) as "isFirstUserMessage"
        from inserted_claims c
        join agents a on a.id = c.agent_id
        join messages m on m.id = c.source_message_id
        order by m.created_at asc
      `;

      return claims.map((claim) => ({
        agent: {
          id: claim.agentId,
          runtimeId: claim.agentRuntimeId,
          channelId: claim.agentChannelId,
          name: claim.agentName,
          description: claim.agentDescription,
          implementation: claim.agentImplementation,
          model: claim.agentModel,
          reasoningEffort: claim.agentReasoningEffort,
          status: claim.agentStatus
        },
        sourceMessage: {
          id: claim.sourceMessageId,
          channelId: claim.sourceChannelId,
          content: claim.sourceContent,
          attachments: claim.sourceAttachments,
          senderId: claim.sourceSenderId,
          senderType: claim.sourceSenderType,
          createdAt: claim.sourceCreatedAt
        },
        isFirstUserMessage: claim.isFirstUserMessage
      }));
    },
    async recordAgentMessageResponse(input) {
      const occurredAt = input.occurredAt ?? new Date().toISOString();
      const [agent] = await sql<AgentIdentity[]>`
        select
          id,
          runtime_id as "runtimeId",
          channel_id as "channelId",
          name,
          description,
          implementation,
          model,
          reasoning_effort as "reasoningEffort",
          status
        from agents
        where id = ${input.agentId}
        limit 1
      `;
      if (!agent) {
        throw new Error("Agent was not found.");
      }

      const [claim] = await sql<Array<{ id: string }>>`
        select id
        from agent_message_claims
        where agent_id = ${input.agentId}
          and source_message_id = ${input.sourceMessageId}
        limit 1
      `;
      if (!claim) {
        const [message] = await sql<Array<{ id: string }>>`
          select id
          from messages
          where id = ${input.sourceMessageId}
          limit 1
        `;
        if (!message) {
          throw new Error("Source message was not found.");
        }
        throw new Error("Agent message claim was not found.");
      }

      let response: MessageDTO | null = null;
      await sql.begin(async (transaction) => {
        const [sourceContext] = await transaction<Array<{
          organizationId: string;
          channelId: string;
          channelType: "group" | "direct";
          senderDisplayName: string;
        }>>`
          select
            m.organization_id as "organizationId",
            m.channel_id as "channelId",
            c.type as "channelType",
            case
              when m.sender_type = 'agent' then coalesce(a.name, m.sender_id)
              else coalesce(split_part(u.email, '@', 1), m.sender_id)
            end as "senderDisplayName"
          from messages m
          join channels c on c.id = m.channel_id
          left join users u on m.sender_type = 'user' and u.id = m.sender_id
          left join agents a on m.sender_type = 'agent' and a.id = m.sender_id
          where m.id = ${input.sourceMessageId}
          limit 1
        `;

        const responseContent =
          sourceContext?.channelType === "group"
            ? prefixMentionedReply(input.content, sourceContext.senderDisplayName)
            : input.content;

        const [createdMessage] = await transaction<MessageDTO[]>`
          insert into messages (id, organization_id, channel_id, sender_id, sender_type, content, attachments, created_at)
          values (${createId("msg")}, ${sourceContext?.organizationId ?? null}, ${sourceContext?.channelId ?? null}, ${input.agentId}, 'agent', ${responseContent}, '[]'::jsonb, ${occurredAt})
          returning id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
        `;
        response = createdMessage ?? null;

        await transaction`
          update agent_message_claims
          set responded_at = ${occurredAt}, response_message_id = ${response?.id ?? null}
          where id = ${claim.id}
        `;
      });

      return {
        message: response!
      };
    },
    async getWorkspacePermissions(orgId: string, userId?: string) {
      const rows = userId
        ? await sql`select * from workspace_permissions where organization_id = ${orgId} and user_id = ${userId}`
        : await sql`select * from workspace_permissions where organization_id = ${orgId}`;
      
      return rows.map((row: {
        id: string;
        organization_id: string;
        user_id: string;
        resource_type: "runtime" | "agent" | "channel";
        resource_id: string;
        permission: "read" | "write" | "admin";
        created_at: string;
        created_by: string;
      }) => ({
        id: row.id,
        organizationId: row.organization_id,
        userId: row.user_id,
        resourceType: row.resource_type,
        resourceId: row.resource_id,
        permission: row.permission,
        createdAt: row.created_at,
        createdBy: row.created_by
      }));
    },
    async grantPermission(input) {
      const [result] = await sql<Array<{
        id: string;
        organization_id: string;
        user_id: string;
        resource_type: "runtime" | "agent" | "channel";
        resource_id: string;
        permission: "read" | "write" | "admin";
        created_at: string;
        created_by: string;
      }>>`insert into workspace_permissions (id, organization_id, user_id, resource_type, resource_id, permission, created_at, created_by)
        values (${createId("perm")}, ${input.organizationId}, ${input.userId}, ${input.resourceType}, ${input.resourceId}, ${input.permission}, ${new Date().toISOString()}, ${input.grantedBy})
        on conflict (organization_id, user_id, resource_type, resource_id, permission) do nothing
        returning *`;
      
      return result ? {
        id: result.id,
        organizationId: result.organization_id,
        userId: result.user_id,
        resourceType: result.resource_type,
        resourceId: result.resource_id,
        permission: result.permission,
        createdAt: result.created_at,
        createdBy: result.created_by
      } : {
        id: "",
        organizationId: input.organizationId,
        userId: input.userId,
        resourceType: input.resourceType,
        resourceId: input.resourceId,
        permission: input.permission,
        createdAt: new Date().toISOString(),
        createdBy: input.grantedBy
      };
    },
    async revokePermission(input) {
      await sql`delete from workspace_permissions where id = ${input.permissionId}`;
    },
    async getWorkspaceInvitations(orgId: string) {
      const result = await sql<Array<{
        id: string;
        organization_id: string;
        email: string;
        role: "owner" | "admin" | "member";
        invited_by: string;
        token: string;
        expires_at: string;
        accepted_at: string | null;
        created_at: string;
      }>>`select * from workspace_invitations where organization_id = ${orgId}`;
      
      return result.map((row) => ({
        id: row.id,
        organizationId: row.organization_id,
        email: row.email,
        role: row.role,
        invitedBy: row.invited_by,
        token: row.token,
        expiresAt: row.expires_at,
        acceptedAt: row.accepted_at,
        createdAt: row.created_at
      }));
    },
    async createWorkspaceInvitation(input) {
      const ttlMs = input.ttlMs ?? 7 * 24 * 60 * 60 * 1000;
      const [result] = await sql<Array<{
        id: string;
        organization_id: string;
        email: string;
        role: "owner" | "admin" | "member";
        invited_by: string;
        token: string;
        expires_at: string;
        accepted_at: string | null;
        created_at: string;
      }>>`insert into workspace_invitations (id, organization_id, email, role, invited_by, token, expires_at, created_at)
        values (${createId("inv")}, ${input.organizationId}, ${input.email}, ${input.role}, ${input.invitedBy}, ${createSecret("invite")}, ${new Date(Date.now() + ttlMs).toISOString()}, ${new Date().toISOString()})
        returning *`;
      
      return {
        id: result.id,
        organizationId: result.organization_id,
        email: result.email,
        role: result.role,
        invitedBy: result.invited_by,
        token: result.token,
        expiresAt: result.expires_at,
        acceptedAt: result.accepted_at,
        createdAt: result.created_at
      };
    },
    async acceptWorkspaceInvitation(token: string, userId: string) {
      const [result] = await sql<Array<{ id: string }>>`select id from workspace_invitations where token = ${token}`;
      if (!result) {
        throw new Error("Invalid invitation token.");
      }
      await sql`update workspace_invitations set accepted_at = ${new Date().toISOString()} where token = ${token}`;
    },
    async getOrganizationMembers(orgId: string) {
      const result = await sql<Array<{
        user_id: string;
        email: string;
        role: "owner" | "admin" | "member";
      }>>`select user_id, u.email as email, role from memberships m join users u on u.id = m.user_id where organization_id = ${orgId}`;
      
      return result.map((row) => ({
        userId: row.user_id,
        email: row.email,
        role: row.role
      }));
    },
    async getChannelParticipants(channelId) {
      const participants = await sql<Array<{
        participantId: string;
        participantType: "user" | "agent";
        displayName: string | null;
        email: string | null;
        role: "owner" | "admin" | "member" | null;
        agentStatus: "running" | "stopped" | "deleted" | null;
      }>>`
        select
          cp.participant_id as "participantId",
          cp.participant_type as "participantType",
          case
            when cp.participant_type = 'agent' then a.name
            else split_part(u.email, '@', 1)
          end as "displayName",
          u.email as email,
          m.role as role,
          a.status as "agentStatus"
        from channel_participants cp
        left join users u
          on cp.participant_type = 'user'
         and u.id = cp.participant_id
        left join memberships m
          on cp.participant_type = 'user'
         and m.user_id = cp.participant_id
         and m.organization_id = (select organization_id from channels where id = ${channelId} limit 1)
        left join agents a
          on cp.participant_type = 'agent'
         and a.id = cp.participant_id
        where cp.channel_id = ${channelId}
        order by cp.participant_type desc, "displayName" asc nulls last
      `;

      if (participants.length === 0) {
        const [channel] = await sql<Array<{ id: string }>>`select id from channels where id = ${channelId} limit 1`;
        if (!channel) {
          throw new Error("Channel not found.");
        }
      }

      return participants.map<ChannelParticipantDTO>((participant) => ({
        participantId: participant.participantId,
        participantType: participant.participantType,
        displayName: participant.displayName ?? participant.participantId,
        email: participant.email,
        role: participant.role,
        agentStatus: participant.agentStatus
      }));
    },
    async updateChannel(input: UpdateChannelInput) {
      const name = input.name.trim().toLowerCase();
      const description = input.description?.trim() ? input.description.trim() : null;

      if (!name) {
        throw new Error("Channel name is required.");
      }

      const [existingChannel] = await sql<Array<{ id: string; name: string }>>`
        select id, name
        from channels
        where id = ${input.channelId}
        limit 1
      `;

      if (!existingChannel) {
        throw new Error("Channel not found.");
      }

      if (existingChannel.id === 'chn_general' && existingChannel.name !== name) {
        throw new Error("The #all channel cannot be renamed.");
      }

      const [channel] = await sql<Array<{ id: string; type: "group" | "direct"; name: string; description: string | null }>>`
        update channels
        set name = ${name},
            description = ${description}
        where id = ${input.channelId}
        returning id, type, name, description
      `;

      return channel!;
    },
    async getPendingAgentResponses(agentId: string) {
      return [];
    },
    async claimAgentResponse(responseId: string, agentId: string) {
      throw new Error("Not implemented in Postgres.");
    },
    async completeAgentResponse(responseId: string) {
      throw new Error("Not implemented in Postgres.");
    }
  };
}

export function getRequiredDatabaseUrl(env: Record<string, string | undefined>) {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Postgres storage.");
  }
  return databaseUrl;
}

function createId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

function createSecret(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, "")}`;
}

function normalizeTextArray(value: string[] | string) {
  return Array.isArray(value) ? value : [value];
}

function toPostgresTextArray(values: string[]) {
  return `{${values.map((value) => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')).join(",")}}`;
}

import { SQL } from "bun";
import type {
  AgentActivityDTO,
  AgentControlActionDTO,
  AgentIdentity,
  RuntimeIssueClaimDTO,
  AuthSession,
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
  CreateIssueFromMessagesInput,
  CreateIssueFromMessageInput,
  CreateMessageInput,
  CreateRuntimeRegistrationCommandInput,
  RecordRuntimeHeartbeatInput,
  RegisterRuntimeInput
} from "./types";

interface CreatePostgresControlPlaneStorageOptions {
  databaseUrl: string;
  schema?: string;
}

type SqlClient = InstanceType<typeof SQL> | Bun.ReservedSQL;

export async function createPostgresControlPlaneStorage(
  options: CreatePostgresControlPlaneStorageOptions
): Promise<ControlPlaneStorage & { initialize(): Promise<void>; seedDemoWorkspace(): Promise<void>; dispose(): Promise<void> }> {
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
    organizationId: "org_demo",
    email: "admin@workpilot.local",
    role: "admin"
  };
  const agentActivitiesByOrganization = new Map<string, Map<string, AgentActivityDTO>>();

  const getOrganization = async (orgId: string) => {
    const [organization] = await sql<{ id: string }[]>`select id from organizations where id = ${orgId} limit 1`;
    return organization ?? null;
  };

  const getChannel = async (channelId: string) => {
    const [channel] = await sql<Array<{ id: string; type: "group" | "direct"; name: string }>>`
      select id, type, name
      from channels
      where id = ${channelId}
      limit 1
    `;
    return channel ? { ...channel, unreadCount: 0 } : null;
  };

  const getChannels = async (orgId: string) => {
    const rows = await sql<
      Array<{ id: string; type: "group" | "direct"; name: string }>
    >`
      select c.id, c.type, c.name
      from channels c
      where c.organization_id = ${orgId}
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
    return sql<RuntimeIdentity[]>`
      select id, name, status
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

  return {
    async initialize() {
      const schemaSql = await readSchemaSql();
      await sql.unsafe(schemaSql);
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

        insert into memberships (organization_id, user_id, role)
        values ('org_demo', 'usr_admin', 'admin')
        on conflict (organization_id, user_id) do nothing;

        insert into channels (id, organization_id, type, name)
        values ('chn_general', 'org_demo', 'group', 'all')
        on conflict (id) do nothing;

        insert into channel_participants (channel_id, participant_id, participant_type)
        values ('chn_general', 'usr_admin', 'user')
        on conflict (channel_id, participant_id, participant_type) do nothing;
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

      const [channel] = await sql<Array<{ id: string; type: "group"; name: string }>>`
        insert into channels (id, organization_id, type, name)
        values (${id}, ${input.organizationId}, 'group', ${name})
        returning id, type, name
      `;

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
      const organization = await getOrganization(orgId);
      const channels = await getChannels(orgId);
      const runtimes = await getRuntimes(orgId);
      const agents = await getAgents(orgId);
      const issues = await sql<IssueDTO[]>`
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
        where organization_id = ${orgId}
        order by created_at asc
      `;
      const messages = await sql<MessageDTO[]>`
        select id, channel_id as "channelId", content, attachments, sender_id as "senderId", sender_type as "senderType", created_at as "createdAt"
        from messages
        where organization_id = ${orgId}
        order by created_at asc
      `;
      const visibleChannelIds = new Set(channels.map((channel) => channel.id));

      return {
        organization,
        channels,
        runtimes,
        agents,
        agentActivities: [...(agentActivitiesByOrganization.get(orgId)?.values() ?? [])]
          .filter((activity) => agents.some((agent) => agent.id === activity.agentId))
          .sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)),
        messages: messages.filter((message) => visibleChannelIds.has(message.channelId)),
        issues
      } satisfies WorkspaceBootstrapPayload;
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
      const [agent] = await sql<AgentIdentity[]>`
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
            ${input.model ?? "claude-sonnet-4.5"},
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
      const [issue] = await sql<IssueDTO[]>`
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
          created_at,
          updated_at
        )
        values (
          ${createId("iss")},
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
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
      return issue;
    },
    async updateIssue(input) {
      const [issue] = await sql<IssueDTO[]>`
        update issues
        set
          status = coalesce(${input.status ?? null}, status),
          assignee_id = case when ${input.assigneeId === undefined} then assignee_id else ${input.assigneeId ?? null} end,
          title = coalesce(${input.title ?? null}, title),
          description = coalesce(${input.description ?? null}, description),
          priority = coalesce(${input.priority ?? null}, priority),
          due_date = case when ${input.dueDate === undefined} then due_date else ${input.dueDate ?? null} end,
          project = case when ${input.project === undefined} then project else ${input.project ?? null} end,
          updated_at = now()
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
      if (!issue) {
        throw new Error("Issue was not found.");
      }
      return issue;
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
      const [issue] = await sql<IssueDTO[]>`
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
          created_at,
          updated_at
        )
        values (
          ${createId("iss")},
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
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
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
      const [issue] = await sql<IssueDTO[]>`
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
          created_at,
          updated_at
        )
        values (
          ${createId("iss")},
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
          created_at as "createdAt",
          updated_at as "updatedAt"
      `;
      return issue;
    },
    async pullRuntimeIssues(input) {
      const claimedIssues = await sql<
        Array<
          IssueDTO & {
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

      const sourceChannelIds = [
        ...new Set(claimedIssues.map((issue) => issue.sourceChannelId).filter((channelId): channelId is string => Boolean(channelId)))
      ];
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
        sourceMessages: issue.sourceChannelId ? (sourceMessagesByChannelId.get(issue.sourceChannelId) ?? []) : []
      }));
    },
    async recordAgentIssueEvent(input) {
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

      let issue: IssueDTO | null = null;
      let message: MessageDTO | null = null;

      await sql.begin(async (transaction) => {
        const [updatedIssue] = await transaction<IssueDTO[]>`
          update issues
          set status = ${input.status}
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
        if (!updatedIssue) {
          throw new Error("Issue was not found.");
        }
        issue = updatedIssue;

        if (input.message && input.message.trim().length > 0) {
          const [createdMessage] = await transaction<MessageDTO[]>`
            insert into messages (id, organization_id, channel_id, sender_id, sender_type, content, attachments, created_at)
            select ${createId("msg")}, organization_id, coalesce(source_channel_id, ${agent.channelId}), ${input.agentId}, 'agent', ${input.message.trim()}, '[]'::jsonb, ${occurredAt}
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
            and c.type = 'direct'
            and m.sender_type = 'user'
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
        const [createdMessage] = await transaction<MessageDTO[]>`
          insert into messages (id, organization_id, channel_id, sender_id, sender_type, content, attachments, created_at)
          select ${createId("msg")}, m.organization_id, m.channel_id, ${input.agentId}, 'agent', ${input.content}, '[]'::jsonb, ${occurredAt}
          from messages m
          where m.id = ${input.sourceMessageId}
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

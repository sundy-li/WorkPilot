import { Hono } from "hono";
import { cors } from "hono/cors";
import { createInMemoryControlPlaneStorage } from "./storage/in-memory";
import type { ControlPlaneStorage } from "./storage/types";

interface CreateControlPlaneAppOptions {
  controlPlaneUrl?: string;
  storage?: ControlPlaneStorage;
}

export function createControlPlaneApp(options: CreateControlPlaneAppOptions = {}) {
  const app = new Hono();
  const controlPlaneUrl = options.controlPlaneUrl ?? "http://127.0.0.1:3001";
  const storage = options.storage ?? createInMemoryControlPlaneStorage();

  app.use(
    "*",
    cors({
      origin: [process.env.WEB_ORIGIN ?? "http://localhost:3000", "http://127.0.0.1:3000"],
      allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
      allowHeaders: ["Content-Type", "Authorization"]
    })
  );

  app.get("/health", (context) => context.json({ ok: true }));

  app.post("/auth/register", async (context) => {
    const body = (await context.req.json()) as { email: string };
    return context.json(
      {
        user: {
          id: "usr_admin",
          email: body.email,
          organizationId: ""
        }
      },
      201
    );
  });

  app.post("/auth/login", async (context) => {
    const body = (await context.req.json()) as { email: string; password: string };
    const session = await storage.getDemoSession();

    if (body.email !== session.email || body.password !== "demo-password") {
      return context.json({ error: "Invalid email or password." }, 401);
    }

    return context.json({ session });
  });

  app.post("/auth/magic-link/send", async (context) => {
    const body = (await context.req.json()) as { email: string };
    return context.json({ ok: true, email: body.email }, 202);
  });

  app.post("/auth/magic-link/verify", async (context) => {
    return context.json({ session: await storage.getDemoSession() });
  });

  app.get("/me", async (context) => {
    return context.json({ session: await storage.getDemoSession() });
  });

  app.get("/workspaces", async (context) => {
    const userId = context.req.query("userId");
    if (!userId) {
      return context.json({ error: "userId is required." }, 400);
    }
    return context.json({ workspaces: await storage.getWorkspacesForUser(userId) });
  });

  app.post("/workspaces", async (context) => {
    const body = (await context.req.json()) as { userId: string; name: string; description?: string };

    try {
      const workspace = await storage.createWorkspace(body);
      return context.json({ workspace }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.get("/organizations/:orgId", async (context) => {
    const organization = await storage.getOrganization(context.req.param("orgId"));
    if (!organization) {
      return context.json({ error: "Organization not found." }, 404);
    }
    return context.json({ organization });
  });

  app.get("/organizations/:orgId/channels", async (context) => {
    const channels = await storage.getChannels(context.req.param("orgId"));
    if (channels.length === 0) {
      return context.json({ error: "Organization not found." }, 404);
    }
    return context.json({ channels });
  });

  app.post("/organizations/:orgId/channels", async (context) => {
    const body = (await context.req.json()) as {
      name: string;
      description?: string;
      actorId?: string;
      members?: Array<{
        participantId: string;
        participantType: "user" | "agent";
      }>;
    };

    try {
      const channel = await storage.createChannel({
        organizationId: context.req.param("orgId"),
        name: body.name,
        description: body.description,
        actorId: body.actorId,
        members: body.members
      });
      return context.json({ channel }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Organization not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/channels/:channelId/messages", async (context) => {
    const channelId = context.req.param("channelId");
    const after = context.req.query("after") ?? undefined;
    const [messages, channel, channelAgents, agentRunLogs] = await Promise.all([
      storage.getMessages({ channelId, after }),
      storage.getChannel(channelId),
      storage.getAgentsForChannel(channelId),
      storage.getAgentRunLogsForChannel(channelId, after)
    ]);
    if (!channel) {
      return context.json({ error: "Channel not found." }, 404);
    }
    const agentIds = channelAgents.map((a) => a.id);
    const agentActivities = await storage.getAgentActivitiesForAgents(agentIds);
    return context.json({
      messages,
      agentActivities,
      agentRunLogs
    });
  });

  app.get("/channels/:channelId/participants", async (context) => {
    try {
      const participants = await storage.getChannelParticipants(context.req.param("channelId"));
      return context.json({ participants });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Channel not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.patch("/channels/:channelId", async (context) => {
    const body = (await context.req.json()) as { name: string; description?: string };

    try {
      const channel = await storage.updateChannel({
        channelId: context.req.param("channelId"),
        name: body.name,
        description: body.description
      });
      return context.json({ channel });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Channel not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/organizations/:orgId/runtimes", async (context) => {
    const runtimes = await storage.getRuntimes(context.req.param("orgId"));
    const organization = await storage.getOrganization(context.req.param("orgId"));
    if (!organization) {
      return context.json({ error: "Organization not found." }, 404);
    }
    return context.json({ runtimes });
  });

  app.get("/organizations/:orgId/agents", async (context) => {
    const agents = await storage.getAgents(context.req.param("orgId"));
    const organization = await storage.getOrganization(context.req.param("orgId"));
    if (!organization) {
      return context.json({ error: "Organization not found." }, 404);
    }
    return context.json({ agents });
  });

  app.get("/bootstrap/workspace", async (context) => {
    const runtimeId = context.req.query("runtimeId");
    if (runtimeId) {
      return context.json(await storage.getWorkspaceBootstrapForRuntime(runtimeId));
    }

    const organizationId = context.req.query("organizationId");
    if (!organizationId) {
      return context.json({ error: "organizationId is required." }, 400);
    }
    return context.json(await storage.getWorkspaceBootstrap(organizationId));
  });

  app.post("/organizations/:orgId/runtime-registration-tokens", async (context) => {
    const body = (await context.req.json()) as { actorId: string; actorRole: "owner" | "admin" | "member" };

    try {
      const command = await storage.createRuntimeRegistrationCommand({
        organizationId: context.req.param("orgId"),
        actorId: body.actorId,
        actorRole: body.actorRole,
        controlPlaneUrl
      });
      return context.json(command, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Organization not found." ? 404 : 403;
      return context.json({ error: message }, status);
    }
  });

  app.post("/runtime/register", async (context) => {
    const body = (await context.req.json()) as {
      registrationToken: string;
      runtimeName: string;
      runtimeKey: string;
    };

    try {
      const runtime = await storage.registerRuntime(body);
      return context.json({ runtime, credential: { token: runtime.credentialId } }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Registration token is invalid." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/runtime/heartbeat", async (context) => {
    const body = (await context.req.json()) as { runtimeId: string; occurredAt?: string };

    try {
      const runtime = await storage.recordRuntimeHeartbeat(body);
      return context.json({ runtime });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Runtime daemon was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.delete("/runtimes/:runtimeId", async (context) => {
    const body = (await context.req.json()) as { actorId: string; occurredAt?: string };

    try {
      const result = await storage.deleteRuntime({
        runtimeId: context.req.param("runtimeId"),
        actorId: body.actorId,
        occurredAt: body.occurredAt
      });
      return context.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Runtime daemon was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/runtimes/:runtimeId/agents", async (context) => {
    const body = (await context.req.json()) as {
      name: string;
      description: string;
      implementation?: "claude" | "codex" | "opencode" | "pi";
      model?: string;
      reasoningEffort?: "low" | "medium" | "high";
    };

    try {
      const agent = await storage.createAgent({
        runtimeId: context.req.param("runtimeId"),
        name: body.name,
        description: body.description,
        implementation: body.implementation,
        model: body.model,
        reasoningEffort: body.reasoningEffort
      });
      return context.json({ agent }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Runtime daemon was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agents/:agentId/direct-channel", async (context) => {
    const body = (await context.req.json()) as {
      userId: string;
    };

    try {
      const channel = await storage.ensureAgentDirectChannel({
        agentId: context.req.param("agentId"),
        userId: body.userId
      });
      return context.json({ channel }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agents/:agentId/control", async (context) => {
    const body = (await context.req.json()) as {
      action: "start" | "stop" | "restart" | "delete";
      restartMode?: "restart" | "reset_session" | "full_reset";
      occurredAt?: string;
    };

    try {
      const result = await storage.controlAgent({
        agentId: context.req.param("agentId"),
        action: body.action,
        restartMode: body.restartMode,
        occurredAt: body.occurredAt
      });
      return context.json(result, 202);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/runtimes/:runtimeId/control-actions", async (context) => {
    return context.json({
      actions: await storage.getRuntimeControlActions(context.req.param("runtimeId"))
    });
  });

  app.post("/control-actions/:actionId/ack", async (context) => {
    const body = (await context.req.json()) as { occurredAt?: string };

    try {
      const action = await storage.acknowledgeAgentControlAction({
        actionId: context.req.param("actionId"),
        occurredAt: body.occurredAt
      });
      return context.json({ action });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent control action was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/channels/:channelId/messages", async (context) => {
    const body = (await context.req.json()) as {
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
    };

    try {
      const message = await storage.createMessage({
        channelId: context.req.param("channelId"),
        content: body.content,
        attachments: body.attachments ?? [],
        senderId: body.senderId,
        senderType: body.senderType,
        occurredAt: body.occurredAt
      });
      return context.json({ message }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Channel not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/issues", async (context) => {
    const body = (await context.req.json()) as {
      actorId: string;
      title: string;
      description: string;
      status?: "backlog" | "todo" | "in_progress" | "in_review" | "done";
      assigneeId: string | null;
      priority?: "low" | "medium" | "high";
      dueDate?: string | null;
      project?: string | null;
      sourceChannelId?: string | null;
    };

    try {
      const issue = await storage.createIssue({
        actorId: body.actorId,
        title: body.title,
        description: body.description,
        status: body.status,
        assigneeId: body.assigneeId,
        priority: body.priority,
        dueDate: body.dueDate,
        project: body.project,
        sourceChannelId: body.sourceChannelId ?? null
      });
      return context.json({ issue }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.patch("/issues/:issueId", async (context) => {
    const body = (await context.req.json()) as {
      actorId: string;
      status?: "backlog" | "todo" | "in_progress" | "in_review" | "done";
      assigneeId?: string | null;
      title?: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      dueDate?: string | null;
      project?: string | null;
    };

    try {
      const issue = await storage.updateIssue({
        issueId: context.req.param("issueId"),
        actorId: body.actorId,
        status: body.status,
        assigneeId: body.assigneeId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        dueDate: body.dueDate,
        project: body.project
      });
      return context.json({ issue });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Issue was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/issues/:issueId/activities", async (context) => {
    try {
      const activities = await storage.getIssueActivities(context.req.param("issueId"));
      return context.json({ activities });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Issue was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.delete("/issues/:issueId", async (context) => {
    const body = (await context.req.json().catch(() => ({}))) as { actorId?: string };

    try {
      const result = await storage.deleteIssue({
        issueId: context.req.param("issueId"),
        actorId: body.actorId ?? "system"
      });
      return context.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Issue was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/issues/:issueId/comments", async (context) => {
    const body = (await context.req.json()) as {
      actorId: string;
      actorType?: "user" | "agent" | "system";
      message: string;
      occurredAt?: string;
    };

    try {
      const activity = await storage.createIssueComment({
        issueId: context.req.param("issueId"),
        actorId: body.actorId,
        actorType: body.actorType ?? "user",
        message: body.message,
        occurredAt: body.occurredAt
      });
      return context.json({ activity }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Issue was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/messages/:messageId/issues", async (context) => {
    const body = (await context.req.json()) as {
      actorId: string;
      assigneeId: string | null;
      title: string;
      description?: string;
      priority?: "low" | "medium" | "high";
      dueDate?: string | null;
      project?: string | null;
    };

    try {
      const issue = await storage.createIssueFromMessage({
        messageId: context.req.param("messageId"),
        actorId: body.actorId,
        assigneeId: body.assigneeId,
        title: body.title,
        description: body.description,
        priority: body.priority,
        dueDate: body.dueDate,
        project: body.project
      });
      return context.json({ issue }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Source message was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/issues/from-messages", async (context) => {
    const body = (await context.req.json()) as {
      actorId: string;
      assigneeId: string | null;
      messageIds: string[];
      title: string;
      description: string;
      priority?: "low" | "medium" | "high";
      dueDate?: string | null;
      project?: string | null;
    };

    try {
      const issue = await storage.createIssueFromMessages({
        actorId: body.actorId,
        assigneeId: body.assigneeId,
        messageIds: body.messageIds,
        title: body.title,
        description: body.description,
        priority: body.priority,
        dueDate: body.dueDate,
        project: body.project
      });
      return context.json({ issue }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Source message was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/runtime/issues/pull", async (context) => {
    const body = (await context.req.json()) as { runtimeId: string; limit?: number; occurredAt?: string };

    return context.json({
      claims: await storage.pullRuntimeIssues({
        runtimeId: body.runtimeId,
        limit: body.limit,
        occurredAt: body.occurredAt
      })
    });
  });

  app.post("/runtime/responses/pull", async (context) => {
    const body = (await context.req.json()) as { runtimeId: string };

    const agentIds = await storage.getAgentIdsForRuntime(body.runtimeId);
    if (agentIds.length === 0) {
      return context.json({ responses: [] });
    }

    const allResponses = await Promise.all(
      agentIds.map((agentId) => storage.getPendingAgentResponses(agentId))
    );

    return context.json({ responses: allResponses.flat() });
  });

  app.post("/runtime/responses/:responseId/claim", async (context) => {
    const body = (await context.req.json()) as { agentId: string };

    try {
      const response = await storage.claimAgentResponse(context.req.param("responseId"), body.agentId);
      return context.json({ response });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.post("/runtime/responses/:responseId/complete", async (context) => {
    const body = (await context.req.json()) as { content: string; agentId: string };

    try {
      await storage.completeAgentResponse(context.req.param("responseId"));
      return context.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.post("/runtime/messages/pull", async (context) => {
    const body = (await context.req.json()) as { runtimeId: string; limit?: number; occurredAt?: string };

    return context.json({
      claims: await storage.pullRuntimeAgentMessages({
        runtimeId: body.runtimeId,
        limit: body.limit,
        occurredAt: body.occurredAt
      })
    });
  });

  app.post("/agent/issue-events", async (context) => {
    const body = (await context.req.json()) as {
      agentId: string;
      issueId: string;
      status: "backlog" | "todo" | "in_progress" | "in_review" | "done";
      message?: string;
      occurredAt?: string;
    };

    try {
      const result = await storage.recordAgentIssueEvent(body);
      return context.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Issue was not found." || message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agent/activity-events", async (context) => {
    const body = (await context.req.json()) as {
      agentId: string;
      status: "idle" | "running";
      summary: string;
      detail?: string;
      occurredAt?: string;
    };

    try {
      const result = await storage.recordAgentActivity(body);
      return context.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agent/run-logs", async (context) => {
    const body = (await context.req.json()) as {
      agentId: string;
      runtimeId: string;
      channelId?: string | null;
      issueId?: string | null;
      sessionId: string;
      kind: "direct_message" | "issue";
      prompt: string;
      response: string;
      occurredAt?: string;
    };

    try {
      const result = await storage.recordAgentRunLog(body);
      return context.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agent/workspace-files", async (context) => {
    const body = (await context.req.json()) as {
      agentId: string;
      files: Array<{
        path: string;
        kind: "file";
        size: number;
        updatedAt: string;
        content: string;
      }>;
    };

    try {
      const result = await storage.syncAgentWorkspaceFiles(body);
      return context.json(result, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/agents/:agentId/workspace-files", async (context) => {
    try {
      const files = await storage.listAgentWorkspaceFiles(context.req.param("agentId"));
      return context.json({ files });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/agents/:agentId/workspace-files/content", async (context) => {
    try {
      const file = await storage.getAgentWorkspaceFile(
        context.req.param("agentId"),
        context.req.query("path") ?? ""
      );

      if (!file) {
        return context.json({ error: "Workspace file not found." }, 404);
      }

      return context.json({ file });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status = message === "Agent was not found." ? 404 : 400;
      return context.json({ error: message }, status);
    }
  });

  app.post("/agent/message-events", async (context) => {
    const body = (await context.req.json()) as {
      agentId: string;
      sourceMessageId: string;
      content: string;
      occurredAt?: string;
    };

    try {
      const result = await storage.recordAgentMessageResponse(body);
      return context.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      const status =
        message === "Source message was not found." ||
        message === "Agent was not found." ||
        message === "Agent message claim was not found."
          ? 404
          : 400;
      return context.json({ error: message }, status);
    }
  });

  app.get("/organizations/:orgId/permissions", async (context) => {
    const orgId = context.req.param("orgId");
    const userId = context.req.query("userId") ?? undefined;
    const permissions = await storage.getWorkspacePermissions(orgId, userId);
    return context.json({ permissions });
  });

  app.post("/organizations/:orgId/permissions", async (context) => {
    const body = (await context.req.json()) as {
      userId: string;
      resourceType: "runtime" | "agent" | "channel";
      resourceId: string;
      permission: "read" | "write" | "admin";
      grantedBy: string;
    };

    try {
      const permission = await storage.grantPermission({
        organizationId: context.req.param("orgId"),
        ...body
      });
      return context.json({ permission }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.delete("/permissions/:permissionId", async (context) => {
    try {
      await storage.revokePermission({ permissionId: context.req.param("permissionId") });
      return context.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.get("/organizations/:orgId/invitations", async (context) => {
    const invitations = await storage.getWorkspaceInvitations(context.req.param("orgId"));
    return context.json({ invitations });
  });

  app.post("/organizations/:orgId/invitations", async (context) => {
    const body = (await context.req.json()) as {
      email: string;
      role: "owner" | "admin" | "member";
      invitedBy: string;
    };

    try {
      const invitation = await storage.createWorkspaceInvitation({
        organizationId: context.req.param("orgId"),
        email: body.email,
        role: body.role,
        invitedBy: body.invitedBy
      });
      return context.json({ invitation }, 201);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.post("/invitations/:token/accept", async (context) => {
    const body = (await context.req.json()) as { userId: string };

    try {
      await storage.acceptWorkspaceInvitation(context.req.param("token"), body.userId);
      return context.json({ ok: true });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error.";
      return context.json({ error: message }, 400);
    }
  });

  app.get("/organizations/:orgId/members", async (context) => {
    const members = await storage.getOrganizationMembers(context.req.param("orgId"));
    return context.json({ members });
  });

  return app;
}

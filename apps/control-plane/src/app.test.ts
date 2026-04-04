import { describe, expect, test } from "bun:test";
import { createControlPlaneApp } from "./app";

describe("control-plane app", () => {
  test("responds to CORS preflight requests for browser clients", async () => {
    const app = createControlPlaneApp();

    const response = await app.request("/auth/login", {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "POST"
      }
    });

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000");
    expect(response.headers.get("access-control-allow-methods")).toContain("POST");
  });

  test("logs in a demo user with email and password", async () => {
    const app = createControlPlaneApp();

    const response = await app.request("/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        email: "admin@workpilot.local",
        password: "demo-password"
      })
    });

    expect(response.status).toBe(200);

    const payload = (await response.json()) as {
      session: {
        userId: string;
        organizationId: string;
      };
    };

    expect(payload.session.userId).toBe("usr_admin");
    expect(payload.session.organizationId).toBe("org_demo");
  });

  test("allows admins to generate node registration tokens and rejects members", async () => {
    const app = createControlPlaneApp();

    const denied = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_member",
        actorRole: "member"
      })
    });

    expect(denied.status).toBe(403);

    const granted = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });

    expect(granted.status).toBe(201);

    const payload = (await granted.json()) as {
      token: string;
      controlPlaneUrl: string;
      installCommand: string;
    };

    expect(payload.token.startsWith("wpt_")).toBe(true);
    expect(payload.controlPlaneUrl).toBeTruthy();
    expect(payload.installCommand).toContain(payload.token);
  });

  test("registers a runtime daemon and accepts heartbeat updates", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });

    const tokenPayload = (await tokenResponse.json()) as {
      token: string;
    };

    const registerResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });

    expect(registerResponse.status).toBe(201);

    const registered = (await registerResponse.json()) as {
      runtime: {
        id: string;
        status: string;
      };
    };

    expect(registered.runtime.status).toBe("pending");

    const heartbeatResponse = await app.request("/runtime/heartbeat", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        runtimeId: registered.runtime.id,
        occurredAt: "2025-01-01T00:00:00.000Z"
      })
    });

    expect(heartbeatResponse.status).toBe(200);

    const heartbeatPayload = (await heartbeatResponse.json()) as {
      runtime: {
        status: string;
      };
    };

    expect(heartbeatPayload.runtime.status).toBe("online");
  });

  test("persists agent activity events in workspace bootstrap", async () => {
    const app = createControlPlaneApp();

    const activityResponse = await app.request("/agent/activity-events", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agentId: "agt_seed",
        status: "running",
        summary: "Codex CLI is applying repository changes.",
        detail: "Streaming tool output",
        occurredAt: "2025-04-03T22:19:08.000Z"
      })
    });

    expect(activityResponse.status).toBe(200);

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      agentActivities?: Array<{
        agentId: string;
        status: string;
        summary: string;
        detail: string | null;
        updatedAt: string;
      }>;
    };

    expect(bootstrapPayload.agentActivities).toContainEqual({
      agentId: "agt_seed",
      status: "running",
      summary: "Codex CLI is applying repository changes.",
      detail: "Streaming tool output",
      updatedAt: "2025-04-03T22:19:08.000Z"
    });
  });

  test("allows the same runtime key to reuse a registration token across restarts", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });
    const tokenPayload = (await tokenResponse.json()) as { token: string };

    const firstResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });
    const secondResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime-restart",
        runtimeKey: "runtime_001"
      })
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);

    const firstPayload = (await firstResponse.json()) as { runtime: { id: string; credentialId: string } };
    const secondPayload = (await secondResponse.json()) as { runtime: { id: string; credentialId: string } };

    expect(secondPayload.runtime.id).toBe(firstPayload.runtime.id);
    expect(secondPayload.runtime.credentialId).toBe(firstPayload.runtime.credentialId);
  });

  test("rejects reusing a registration token for a different runtime key", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });
    const tokenPayload = (await tokenResponse.json()) as { token: string };

    await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });

    const secondResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "intruder-runtime",
        runtimeKey: "runtime_002"
      })
    });

    expect(secondResponse.status).toBe(400);

    const secondPayload = (await secondResponse.json()) as { error: string };
    expect(secondPayload.error).toBe("Registration token has already been used.");
  });

  test("creates multiple agents under a runtime daemon", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });

    const tokenPayload = (await tokenResponse.json()) as { token: string };

    const registerResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });

    const registerPayload = (await registerResponse.json()) as {
      runtime: { id: string };
    };

    const firstAgentResponse = await app.request(`/runtimes/${registerPayload.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Incident Commander",
        description: "Own incident triage and next actions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });

    const secondAgentResponse = await app.request(`/runtimes/${registerPayload.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Deploy Analyst",
        description: "Investigate deployment health and rollback options.",
        implementation: "claude",
        model: "claude-sonnet-4.5",
        reasoningEffort: "medium"
      })
    });

    expect(firstAgentResponse.status).toBe(201);
    expect(secondAgentResponse.status).toBe(201);

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      runtimes: Array<{ id: string }>;
      agents: Array<{
        id: string;
        runtimeId: string;
        channelId: string;
        name: string;
        description: string;
        implementation: string;
        model: string;
        reasoningEffort: string;
        status: string;
      }>;
    };

    expect(bootstrapPayload.runtimes.length).toBeGreaterThan(0);
    expect(bootstrapPayload.agents.filter((agent) => agent.runtimeId === registerPayload.runtime.id)).toHaveLength(2);
    expect(bootstrapPayload.agents.find((agent) => agent.name === "Incident Commander")).toMatchObject({
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high",
      status: "running"
    });
    expect(bootstrapPayload.agents.find((agent) => agent.name === "Incident Commander")?.channelId.startsWith("dir_")).toBe(true);
  });

  test("creates a channel through the control-plane and allows posting messages to it", async () => {
    const app = createControlPlaneApp();

    const createChannelResponse = await app.request("/organizations/org_demo/channels", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "incidents"
      })
    });

    expect(createChannelResponse.status).toBe(201);

    const createChannelPayload = (await createChannelResponse.json()) as {
      channel: { id: string; name: string };
    };

    expect(createChannelPayload.channel.name).toBe("incidents");

    const messageResponse = await app.request(`/channels/${createChannelPayload.channel.id}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Channel created successfully.",
        senderId: "usr_admin",
        senderType: "user"
      })
    });

    expect(messageResponse.status).toBe(201);
  });

  test("loads channel messages incrementally from a timestamp cursor", async () => {
    const app = createControlPlaneApp();

    await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Earlier note",
        senderId: "usr_admin",
        senderType: "user",
        occurredAt: "2025-04-03T22:18:08.000Z"
      })
    });

    await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Latest note",
        senderId: "usr_admin",
        senderType: "user",
        occurredAt: "2025-04-03T22:20:08.000Z"
      })
    });

    const response = await app.request("/channels/chn_general/messages?after=2025-04-03T22:19:00.000Z");
    const payload = (await response.json()) as {
      messages: Array<{ content: string }>;
    };

    expect(response.status).toBe(200);
    expect(payload.messages.map((message) => message.content)).toContain("Latest note");
    expect(payload.messages.map((message) => message.content)).not.toContain("Earlier note");
  });

  test("includes direct-thread agent activity alongside channel messages", async () => {
    const app = createControlPlaneApp();

    await app.request("/agent/activity-events", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agentId: "agt_seed",
        status: "running",
        summary: "Codex CLI is replying in chat.",
        detail: "Working on message msg_123",
        occurredAt: "2025-04-03T22:21:08.000Z"
      })
    });

    const response = await app.request("/channels/dir_admin_ops/messages");
    const payload = (await response.json()) as {
      agentActivities?: Array<{ agentId: string; status: string; summary: string }>;
    };

    expect(payload.agentActivities?.[0]).toMatchObject({
      agentId: "agt_seed",
      status: "running",
      summary: "Codex CLI is replying in chat."
    });
  });

  test("soft deletes a runtime and hides its agents from workspace bootstrap", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });

    const tokenPayload = (await tokenResponse.json()) as { token: string };

    const registerResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });

    const registerPayload = (await registerResponse.json()) as {
      runtime: { id: string };
    };

    const createAgentResponse = await app.request(`/runtimes/${registerPayload.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Incident Commander",
        description: "Own incident triage and next actions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });

    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: { id: string };
    };

    const deleteResponse = await app.request(`/runtimes/${registerPayload.runtime.id}`, {
      method: "DELETE",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin"
      })
    });

    expect(deleteResponse.status).toBe(202);

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      runtimes: Array<{ id: string }>;
      agents: Array<{ id: string; runtimeId: string }>;
    };

    expect(bootstrapPayload.runtimes.find((runtime) => runtime.id === registerPayload.runtime.id)).toBeUndefined();
    expect(bootstrapPayload.agents.find((agent) => agent.id === createAgentPayload.agent.id)).toBeUndefined();
  });

  test("creates a global issue without a source channel", async () => {
    const app = createControlPlaneApp();

    const response = await app.request("/issues", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        title: "Set up first kanban workflow",
        description: "Create a default issue directly from the board.",
        assigneeId: null,
        priority: "medium",
        dueDate: null,
        project: "workspace",
        sourceChannelId: null
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as {
      issue: {
        id: string;
        title: string;
        status: string;
        sourceChannelId: string | null;
      };
    };

    expect(payload.issue.id.startsWith("iss_")).toBe(true);
    expect(payload.issue.title).toBe("Set up first kanban workflow");
    expect(payload.issue.status).toBe("backlog");
    expect(payload.issue.sourceChannelId).toBeNull();
  });

  test("updates an issue status", async () => {
    const app = createControlPlaneApp();

    const createResponse = await app.request("/issues", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        title: "Move me to in progress",
        description: "Created for drag and drop.",
        assigneeId: null,
        sourceChannelId: null
      })
    });

    const createPayload = (await createResponse.json()) as {
      issue: { id: string };
    };

    const updateResponse = await app.request(`/issues/${createPayload.issue.id}`, {
      method: "PATCH",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        status: "in_progress"
      })
    });

    expect(updateResponse.status).toBe(200);

    const updatePayload = (await updateResponse.json()) as {
      issue: { status: string };
    };

    expect(updatePayload.issue.status).toBe("in_progress");
  });

  test("controls an agent and exposes pending control actions to the runtime", async () => {
    const app = createControlPlaneApp();

    const tokenResponse = await app.request("/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    });

    const tokenPayload = (await tokenResponse.json()) as { token: string };

    const registerResponse = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: tokenPayload.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });

    const registerPayload = (await registerResponse.json()) as {
      runtime: { id: string };
    };

    const createAgentResponse = await app.request(`/runtimes/${registerPayload.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Incident Commander",
        description: "Own incident triage and next actions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });
    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: { id: string };
    };

    const stopResponse = await app.request(`/agents/${createAgentPayload.agent.id}/control`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "stop"
      })
    });

    expect(stopResponse.status).toBe(202);

    const restartResponse = await app.request(`/agents/${createAgentPayload.agent.id}/control`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "restart",
        restartMode: "full_reset"
      })
    });

    expect(restartResponse.status).toBe(202);

    const actionResponse = await app.request(`/runtimes/${registerPayload.runtime.id}/control-actions`);

    expect(actionResponse.status).toBe(200);

    const actionPayload = (await actionResponse.json()) as {
      actions: Array<{
        id: string;
        action: string;
        restartMode: string | null;
      }>;
    };

    expect(actionPayload.actions.map((action) => action.action)).toEqual(["stop", "restart"]);
    expect(actionPayload.actions[1]?.restartMode).toBe("full_reset");

    const ackResponse = await app.request(`/control-actions/${actionPayload.actions[0]?.id}/ack`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({})
    });

    expect(ackResponse.status).toBe(200);

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      agents: Array<{ id: string; status: string }>;
    };

    expect(bootstrapPayload.agents.find((agent) => agent.id === createAgentPayload.agent.id)?.status).toBe("stopped");
  });

  test("creates an issue from a source message", async () => {
    const app = createControlPlaneApp();

    const response = await app.request("/messages/msg_seed/issues", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        assigneeId: "agt_seed",
        title: "Triage deployment issue"
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as {
      issue: {
        id: string;
        status: string;
        sourceChannelId: string | null;
      };
    };

    expect(payload.issue.id.startsWith("iss_")).toBe(true);
    expect(payload.issue.status).toBe("todo");
    expect(payload.issue.sourceChannelId).toBe("chn_general");
  });

  test("creates one aggregated issue from multiple source messages", async () => {
    const app = createControlPlaneApp();

    const messageResponse = await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Check whether rollback is safe before restart.",
        senderId: "usr_admin",
        senderType: "user"
      })
    });

    expect(messageResponse.status).toBe(201);

    const createdMessagePayload = (await messageResponse.json()) as {
      message: {
        id: string;
      };
    };

    const response = await app.request("/issues/from-messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        assigneeId: "agt_seed",
        messageIds: ["msg_seed", createdMessagePayload.message.id],
        title: "Deployment rollback investigation",
        description: "Use both messages as issue context and summarize next actions."
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as {
      issue: {
        description: string;
        status: string;
        sourceChannelId: string | null;
      };
    };

    expect(payload.issue.description).toBe("Use both messages as issue context and summarize next actions.");
    expect(payload.issue.status).toBe("todo");
    expect(payload.issue.sourceChannelId).toBe("chn_general");
  });

  test("creates a message with clipboard attachments", async () => {
    const app = createControlPlaneApp();

    const response = await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Attaching the screenshot and logs.",
        senderId: "usr_admin",
        senderType: "user",
        attachments: [
          {
            name: "incident.png",
            mediaType: "image/png",
            size: 1536,
            kind: "image",
            dataUrl: "data:image/png;base64,AAAA"
          },
          {
            name: "trace.log",
            mediaType: "text/plain",
            size: 320,
            kind: "file",
            dataUrl: "data:text/plain;base64,Qm9vbQ=="
          }
        ]
      })
    });

    expect(response.status).toBe(201);

    const payload = (await response.json()) as {
      message: {
        attachments: Array<{
          id: string;
          name: string;
          kind: string;
        }>;
      };
    };

    expect(payload.message.attachments).toHaveLength(2);
    expect(payload.message.attachments[0]?.id.startsWith("att_")).toBe(true);
    expect(payload.message.attachments[0]?.kind).toBe("image");
    expect(payload.message.attachments[1]?.name).toBe("trace.log");
  });

  test("claims runtime issues and records agent issue completion events", async () => {
    const app = createControlPlaneApp();

    const issueResponse = await app.request("/messages/msg_seed/issues", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        assigneeId: "agt_seed",
        title: "Triage deployment issue"
      })
    });

    const issuePayload = (await issueResponse.json()) as {
      issue: { id: string };
    };

    const pullResponse = await app.request("/runtime/issues/pull", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        runtimeId: "rtm_seed",
        limit: 10
      })
    });

    expect(pullResponse.status).toBe(200);

    const pullPayload = (await pullResponse.json()) as {
      claims: Array<{
        issue: { id: string; status: string };
        agent: { id: string };
        sourceMessages: Array<{ id: string }>;
      }>;
    };

    expect(pullPayload.claims).toHaveLength(1);
    expect(pullPayload.claims[0]?.issue.id).toBe(issuePayload.issue.id);
    expect(pullPayload.claims[0]?.issue.status).toBe("in_progress");
    expect(pullPayload.claims[0]?.agent.id).toBe("agt_seed");
    expect(pullPayload.claims[0]?.sourceMessages.map((message) => message.id)).toEqual(["msg_seed"]);

    const eventResponse = await app.request("/agent/issue-events", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agentId: "agt_seed",
        issueId: issuePayload.issue.id,
        status: "done",
        message: "Deployment issue triaged. Rollback is safe."
      })
    });

    expect(eventResponse.status).toBe(200);

    const eventPayload = (await eventResponse.json()) as {
      issue: { status: string };
      message: { senderId: string; senderType: string; content: string };
    };

    expect(eventPayload.issue.status).toBe("done");
    expect(eventPayload.message.senderId).toBe("agt_seed");
    expect(eventPayload.message.senderType).toBe("agent");
    expect(eventPayload.message.content).toContain("Rollback is safe");
  });

  test("claims direct-thread user messages and records agent replies", async () => {
    const app = createControlPlaneApp();

    const directChannelResponse = await app.request("/agents/agt_seed/direct-channel", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: "usr_admin"
      })
    });

    expect(directChannelResponse.status).toBe(201);

    const directChannelPayload = (await directChannelResponse.json()) as {
      channel: { id: string };
    };

    const messageResponse = await app.request(`/channels/${directChannelPayload.channel.id}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Why did the deploy fail?",
        senderId: "usr_admin",
        senderType: "user"
      })
    });

    expect(messageResponse.status).toBe(201);

    const messagePayload = (await messageResponse.json()) as {
      message: { id: string };
    };

    const pullResponse = await app.request("/runtime/messages/pull", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        runtimeId: "rtm_seed",
        limit: 10
      })
    });

    expect(pullResponse.status).toBe(200);

    const pullPayload = (await pullResponse.json()) as {
      claims: Array<{
        agent: { id: string; channelId: string };
        sourceMessage: { id: string; channelId: string; content: string };
        isFirstUserMessage: boolean;
      }>;
    };

    expect(pullPayload.claims).toHaveLength(1);
    expect(pullPayload.claims[0]?.agent.id).toBe("agt_seed");
    expect(pullPayload.claims[0]?.sourceMessage.id).toBe(messagePayload.message.id);
    expect(pullPayload.claims[0]?.sourceMessage.channelId).toBe(directChannelPayload.channel.id);
    expect(pullPayload.claims[0]?.isFirstUserMessage).toBe(true);

    const respondResponse = await app.request("/agent/message-events", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        agentId: "agt_seed",
        sourceMessageId: messagePayload.message.id,
        content: "The health-check failed after the deploy step timed out."
      })
    });

    expect(respondResponse.status).toBe(200);

    const respondPayload = (await respondResponse.json()) as {
      message: { senderId: string; senderType: string; channelId: string; content: string };
    };

    expect(respondPayload.message.senderId).toBe("agt_seed");
    expect(respondPayload.message.senderType).toBe("agent");
    expect(respondPayload.message.channelId).toBe(directChannelPayload.channel.id);
    expect(respondPayload.message.content).toContain("timed out");
  });

  test("creates isolated direct channels per user for the same agent", async () => {
    const app = createControlPlaneApp();

    const firstResponse = await app.request("/agents/agt_seed/direct-channel", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: "usr_admin"
      })
    });
    const secondResponse = await app.request("/agents/agt_seed/direct-channel", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: "usr_member"
      })
    });
    const repeatResponse = await app.request("/agents/agt_seed/direct-channel", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        userId: "usr_admin"
      })
    });

    expect(firstResponse.status).toBe(201);
    expect(secondResponse.status).toBe(201);
    expect(repeatResponse.status).toBe(201);

    const firstPayload = (await firstResponse.json()) as { channel: { id: string; type: string } };
    const secondPayload = (await secondResponse.json()) as { channel: { id: string; type: string } };
    const repeatPayload = (await repeatResponse.json()) as { channel: { id: string; type: string } };

    expect(firstPayload.channel.type).toBe("direct");
    expect(secondPayload.channel.type).toBe("direct");
    expect(firstPayload.channel.id).not.toBe(secondPayload.channel.id);
    expect(firstPayload.channel.id).toBe(repeatPayload.channel.id);
  });
});

import { describe, expect, test } from "bun:test";
import { createControlPlaneApp } from "../../../control-plane/src/app";
import { createWorkPilotApiClient } from "./api";

describe("workpilot api client", () => {
  test("submits a signup request to the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.register({
      email: "new-user@workpilot.local"
    });

    expect(payload.user.email).toBe("new-user@workpilot.local");
    expect(payload.user.organizationId).toBe("org_demo");
  });

  test("loads the bootstrap workspace payload from the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.getWorkspaceBootstrap();

    expect(payload.organization?.id).toBe("org_demo");
    expect(payload.channels.length).toBeGreaterThan(0);
    expect(payload.runtimes.length).toBeGreaterThan(0);
    expect(payload.messages.length).toBeGreaterThan(0);
    expect(payload.agents.length).toBeGreaterThan(0);
  });

  test("loads runtime identities for polling a new connection", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.getRuntimes("org_demo");

    expect(payload.runtimes.length).toBeGreaterThan(0);
    expect(payload.runtimes[0]?.id).toBe("rtm_seed");
  });

  test("creates a channel through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.createChannel({
      organizationId: "org_demo",
      name: "incidents"
    });

    expect(payload.channel.id.startsWith("chn_")).toBe(true);
    expect(payload.channel.name).toBe("incidents");
  });

  test("controls an agent through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const result = await client.controlAgent({
      agentId: "agt_seed",
      action: "stop"
    });

    expect(result.agent?.id).toBe("agt_seed");
    expect(result.agent?.status).toBe("stopped");

    const payload = await client.getWorkspaceBootstrap();

    expect(payload.agents.find((agent) => agent.id === "agt_seed")?.status).toBe("stopped");
  });

  test("creates or reuses a direct channel for a user-agent thread", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const first = await client.ensureAgentDirectChannel({
      agentId: "agt_seed",
      userId: "usr_admin"
    });
    const second = await client.ensureAgentDirectChannel({
      agentId: "agt_seed",
      userId: "usr_admin"
    });
    const other = await client.ensureAgentDirectChannel({
      agentId: "agt_seed",
      userId: "usr_member"
    });

    expect(first.channel.type).toBe("direct");
    expect(first.channel.id).toBe(second.channel.id);
    expect(first.channel.id).not.toBe(other.channel.id);
  });

  test("creates a global issue through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const result = await client.createIssue({
      actorId: "usr_admin",
      title: "Create kanban issue",
      description: "Created from the board modal.",
      status: "backlog",
      assigneeId: null,
      priority: "medium",
      dueDate: null,
      project: "workspace",
      sourceChannelId: null
    });

    expect(result.issue.title).toBe("Create kanban issue");
    expect(result.issue.status).toBe("backlog");
    expect(result.issue.sourceChannelId).toBeNull();
  });

  test("updates an issue through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const created = await client.createIssue({
      actorId: "usr_admin",
      title: "Drag me",
      description: "Status should update.",
      status: "backlog",
      assigneeId: null,
      priority: "medium",
      dueDate: null,
      project: null,
      sourceChannelId: null
    });

    const result = await client.updateIssue({
      issueId: created.issue.id,
      status: "in_progress"
    });

    expect(result.issue.status).toBe("in_progress");
  });

  test("soft deletes a runtime through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const command = await client.createRuntimeRegistrationCommand("org_demo", "usr_admin", "admin");
    const registration = await app.request("/runtime/register", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        registrationToken: command.token,
        runtimeName: "ops-runtime",
        runtimeKey: "runtime_001"
      })
    });
    const registered = (await registration.json()) as {
      runtime: { id: string };
    };

    const result = await client.deleteRuntime({
      runtimeId: registered.runtime.id,
      actorId: "usr_admin"
    });

    expect(result.runtime?.id).toBe(registered.runtime.id);
    expect(result.runtime?.status).toBe("deleted");
  });

  test("creates a runtime registration command for the provided organization id", async () => {
    let requestedPath = "";

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: async (request) => {
        requestedPath = new URL(request.url).pathname;
        return new Response(
          JSON.stringify({
            token: "wpt_demo",
            expiresAt: "2025-01-01T00:15:00.000Z",
            controlPlaneUrl: "http://control-plane.local",
            installCommand: "bun run"
          }),
          {
            status: 201,
            headers: {
              "content-type": "application/json"
            }
          }
        );
      }
    });

    await client.createRuntimeRegistrationCommand("org_custom", "usr_admin", "admin");

    expect(requestedPath).toBe("/organizations/org_custom/runtime-registration-tokens");
  });
});

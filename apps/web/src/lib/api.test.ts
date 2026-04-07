import { describe, expect, test } from "bun:test";
import { TEST_ORG_ID } from "@workpilot/shared";
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
    expect(payload.user.organizationId).toBe("");
  });

  test("loads the bootstrap workspace payload from the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.getWorkspaceBootstrap(TEST_ORG_ID);

    expect(payload.organization?.id).toBe(TEST_ORG_ID);
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

    const payload = await client.getRuntimes(TEST_ORG_ID);

    expect(payload.runtimes.length).toBeGreaterThan(0);
    expect(payload.runtimes[0]?.id).toBe("rtm_seed");
  });

  test("lists and creates workspaces through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const before = await client.getWorkspaces("usr_fresh");
    expect(before.workspaces).toEqual([]);

    const created = await client.createWorkspace({
      userId: "usr_fresh",
      name: "Release"
    });

    expect(created.workspace.slug).toBe("release");

    const after = await client.getWorkspaces("usr_fresh");
    expect(after.workspaces).toContainEqual(created.workspace);
  });

  test("loads channel messages after a timestamp cursor", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Fresh update",
        senderId: "usr_admin",
        senderType: "user",
        occurredAt: "2025-04-03T22:20:08.000Z"
      })
    });

    const payload = await client.getChannelMessages("chn_general", {
      after: "2025-04-03T22:19:00.000Z"
    });

    expect(payload.messages.some((message) => message.content === "Fresh update")).toBe(true);
  });

  test("creates a channel with description and members through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const payload = await client.createChannel({
      organizationId: TEST_ORG_ID,
      name: "incidents",
      description: "Cross-functional incident coordination",
      actorId: "usr_admin",
      members: [
        { participantId: "usr_member", participantType: "user" },
        { participantId: "agt_seed", participantType: "agent" }
      ]
    });

    expect(payload.channel.id.startsWith("chn_")).toBe(true);
    expect(payload.channel.name).toBe("incidents");
    expect(payload.channel.description).toBe("Cross-functional incident coordination");
  });

  test("loads channel participants and updates channel metadata through the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const client = createWorkPilotApiClient({
      baseUrl: "http://control-plane.local",
      fetcher: app.fetch
    });

    const participants = await client.getChannelParticipants("chn_general");
    expect(participants.participants.some((participant) => participant.participantId === "usr_admin")).toBe(true);

    const updated = await client.updateChannel({
      channelId: "chn_general",
      name: "all",
      description: "General channel for the whole workspace"
    });

    expect(updated.channel.id).toBe("chn_general");
    expect(updated.channel.description).toBe("General channel for the whole workspace");
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

    const payload = await client.getWorkspaceBootstrap(TEST_ORG_ID);

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
      actorId: "usr_admin",
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

    const command = await client.createRuntimeRegistrationCommand(TEST_ORG_ID, "usr_admin", "admin");
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

import { afterEach, describe, expect, test } from "bun:test";
import { TEST_ORG_ID } from "@workpilot/shared";
import { createPostgresControlPlaneStorage } from "./postgres";

const cleanupCallbacks: Array<() => Promise<void>> = [];

afterEach(async () => {
  while (cleanupCallbacks.length > 0) {
    const callback = cleanupCallbacks.pop();
    if (callback) {
      await callback();
    }
  }
});

describe("postgres control-plane storage", () => {
  test("initializes schema and returns seeded bootstrap workspace", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const workspace = await storage.getWorkspaceBootstrap(TEST_ORG_ID);

    expect(workspace.organization?.id).toBe(TEST_ORG_ID);
    expect(workspace.runtimes.length).toBeGreaterThan(0);
    expect(workspace.agents.length).toBeGreaterThan(0);
    expect(workspace.messages.length).toBeGreaterThan(0);
  });

  test("persists runtime registration and agent creation in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const command = await storage.createRuntimeRegistrationCommand({
      organizationId: TEST_ORG_ID,
      actorId: "usr_admin",
      actorRole: "admin",
      controlPlaneUrl: "http://localhost:3001"
    });

    const runtime = await storage.registerRuntime({
      registrationToken: command.token,
      runtimeName: "runtime-db",
      runtimeKey: "runtime_db_001"
    });

    await storage.recordRuntimeHeartbeat({
      runtimeId: runtime.id
    });

    const agent = await storage.createAgent({
      runtimeId: runtime.id,
      name: "Database Agent",
      description: "Loaded from Postgres and bound to a runtime.",
      implementation: "opencode",
      model: "gpt-5",
      reasoningEffort: "medium"
    });

    const workspace = await storage.getWorkspaceBootstrap(TEST_ORG_ID);

    expect(workspace.runtimes.some((entry) => entry.id === runtime.id)).toBe(true);
    expect(workspace.agents.some((entry) => entry.id === agent.id && entry.runtimeId === runtime.id)).toBe(true);
    expect(workspace.agents.find((entry) => entry.id === agent.id)).toMatchObject({
      channelId: agent.channelId,
      implementation: "opencode",
      model: "gpt-5",
      reasoningEffort: "medium",
      status: "running"
    });
  });

  test("reuses a registration token for the same runtime key and rejects a different one", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const command = await storage.createRuntimeRegistrationCommand({
      organizationId: TEST_ORG_ID,
      actorId: "usr_admin",
      actorRole: "admin",
      controlPlaneUrl: "http://localhost:3001"
    });

    const first = await storage.registerRuntime({
      registrationToken: command.token,
      runtimeName: "runtime-db",
      runtimeKey: "runtime_db_001"
    });
    const second = await storage.registerRuntime({
      registrationToken: command.token,
      runtimeName: "runtime-db-restart",
      runtimeKey: "runtime_db_001"
    });

    expect(second.id).toBe(first.id);
    expect(second.credentialId).toBe(first.credentialId);

    await expect(
      storage.registerRuntime({
        registrationToken: command.token,
        runtimeName: "intruder-runtime",
        runtimeKey: "runtime_db_002"
      })
    ).rejects.toThrow("Registration token has already been used.");
  });

  test("creates channels with empty description and multiple participants in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const channel = await storage.createChannel({
      organizationId: TEST_ORG_ID,
      name: "dev",
      description: "",
      actorId: "usr_admin",
      members: [
        { participantId: "agt_seed", participantType: "agent" },
        { participantId: "usr_member", participantType: "user" }
      ]
    });

    expect(channel.name).toBe("dev");
    expect(channel.description).toBeNull();

    const workspace = await storage.getWorkspaceBootstrap(TEST_ORG_ID);
    expect(workspace.channels.some((entry) => entry.id === channel.id && entry.description === null)).toBe(true);
  });

  test("persists agent control actions and issue claims in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const claims = await storage.pullRuntimeIssues({
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(claims).toEqual([]);

    const issue = await storage.createIssueFromMessage({
      messageId: "msg_seed",
      actorId: "usr_admin",
      assigneeId: "agt_seed",
      title: "Triage deployment issue"
    });

    const stopControl = await storage.controlAgent({
      agentId: "agt_seed",
      action: "stop"
    });

    expect(stopControl.agent?.status).toBe("stopped");

    const stoppedClaims = await storage.pullRuntimeIssues({
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(stoppedClaims).toEqual([]);

    await storage.controlAgent({
      agentId: "agt_seed",
      action: "start"
    });

    const runningClaims = await storage.pullRuntimeIssues({
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(runningClaims).toHaveLength(1);
    expect(runningClaims[0]?.issue.id).toBe(issue.id);
    expect(runningClaims[0]?.issue.status).toBe("in_progress");
    expect(runningClaims[0]?.agent.id).toBe("agt_seed");
    expect(runningClaims[0]?.sourceMessages.map((message) => message.id)).toEqual(["msg_seed"]);

    const restartControl = await storage.controlAgent({
      agentId: "agt_seed",
      action: "restart",
      restartMode: "full_reset"
    });

    expect(restartControl.controlAction?.action).toBe("restart");

    const actions = await storage.getRuntimeControlActions("rtm_seed");

    expect(actions.some((action) => action.id === restartControl.controlAction?.id)).toBe(true);

    const completion = await storage.recordAgentIssueEvent({
      agentId: "agt_seed",
      issueId: issue.id,
      status: "done",
      message: "Deployment issue triaged."
    });

    expect(completion.issue.status).toBe("done");
    expect(completion.message?.senderType).toBe("agent");
  });

  test("hides issue discussion channels from visible channel lists in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const issue = await storage.createIssueFromMessage({
      messageId: "msg_seed",
      actorId: "usr_admin",
      assigneeId: "agt_seed",
      title: "Triage deployment issue"
    });

    await storage.recordAgentIssueEvent({
      agentId: "agt_seed",
      issueId: issue.id,
      status: "in_review",
      message: "@usr_admin Fixed and ready for review."
    });

    const channels = await storage.getChannels(TEST_ORG_ID);
    expect(channels.some((channel) => channel.id === issue.discussionChannelId)).toBe(false);
    expect(channels.some((channel) => channel.name.startsWith("issue-"))).toBe(false);

    const workspace = await storage.getWorkspaceBootstrap(TEST_ORG_ID);
    expect(workspace.channels.some((channel) => channel.id === issue.discussionChannelId)).toBe(false);
    expect(
      workspace.messages.some(
        (message) => message.channelId === issue.discussionChannelId && message.content.includes("ready for review")
      )
    ).toBe(true);

    const directMessages = await storage.getMessages({ channelId: "dir_admin_ops" });
    expect(directMessages.some((message) => message.content.includes("ready for review"))).toBe(false);
  });

  test("persists direct-thread message claims and agent replies in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const userMessage = await storage.createMessage({
      channelId: "dir_admin_ops",
      content: "Can you summarize what broke?",
      senderId: "usr_admin",
      senderType: "user"
    });

    const claims = await storage.pullRuntimeAgentMessages({
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(claims).toHaveLength(1);
    expect(claims[0]?.agent.id).toBe("agt_seed");
    expect(claims[0]?.sourceMessage.id).toBe(userMessage.id);
    expect(claims[0]?.isFirstUserMessage).toBe(true);

    const response = await storage.recordAgentMessageResponse({
      agentId: "agt_seed",
      sourceMessageId: userMessage.id,
      content: "The rollout failed during the health-check phase."
    });

    expect(response.message.channelId).toBe("dir_admin_ops");
    expect(response.message.senderType).toBe("agent");
    expect(response.message.content).toContain("health-check");
  });

  test("creates isolated direct channels per user for the same agent in postgres", async () => {
    const storage = await createPostgresControlPlaneStorage({
      databaseUrl: process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy",
      schema: createTestSchemaName()
    });
    cleanupCallbacks.push(() => storage.dispose());

    await storage.initialize();
    await storage.seedDemoWorkspace();

    const command = await storage.createRuntimeRegistrationCommand({
      organizationId: TEST_ORG_ID,
      actorId: "usr_admin",
      actorRole: "admin",
      controlPlaneUrl: "http://localhost:3001"
    });
    const runtime = await storage.registerRuntime({
      registrationToken: command.token,
      runtimeName: "runtime-db",
      runtimeKey: "runtime_db_threads"
    });
    const agent = await storage.createAgent({
      runtimeId: runtime.id,
      name: "Threaded Agent",
      description: "Uses per-user direct channels.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "medium"
    });

    const first = await storage.ensureAgentDirectChannel({
      agentId: agent.id,
      userId: "usr_admin"
    });
    const second = await storage.ensureAgentDirectChannel({
      agentId: agent.id,
      userId: "usr_admin"
    });
    const other = await storage.ensureAgentDirectChannel({
      agentId: agent.id,
      userId: "usr_member"
    });

    expect(first.type).toBe("direct");
    expect(first.id).toBe(second.id);
    expect(first.id).not.toBe(other.id);
  });
});

function createTestSchemaName() {
  return `workpilot_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

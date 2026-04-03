import { describe, expect, test } from "bun:test";
import {
  acknowledgeAgentControlAction,
  claimRuntimeIssues,
  claimRuntimeAgentMessages,
  createAgentProfile,
  createIssue,
  createIssueFromMessage,
  createIssueFromMessages,
  createRuntimeRegistrationToken,
  createWorkspaceSnapshot,
  createMessage,
  queueAgentControlAction,
  softDeleteRuntimeDaemon,
  recordAgentMessageResponse,
  recordAgentIssueEvent,
  reconcileOfflineRuntimes,
  recordRuntimeHeartbeat,
  registerRuntimeDaemon
} from "./workspace";

describe("workspace domain", () => {
  test("allows only owner or admin to generate a runtime registration token", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    expect(() =>
      createRuntimeRegistrationToken(workspace, {
        actorId: "usr_owner",
        actorRole: "owner"
      })
    ).not.toThrow();

    expect(() =>
      createRuntimeRegistrationToken(workspace, {
        actorId: "usr_member",
        actorRole: "member"
      })
    ).toThrow("Only organization owners or admins can register runtime daemons.");
  });

  test("marks runtime daemons offline when heartbeats expire", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    recordRuntimeHeartbeat(workspace, {
      runtimeId: runtime.id,
      occurredAt: "2025-01-01T00:00:00.000Z"
    });

    expect(workspace.runtimes[0]?.status).toBe("online");

    reconcileOfflineRuntimes(workspace, {
      now: "2025-01-01T00:06:00.000Z",
      offlineThresholdMs: 5 * 60 * 1000
    });

    expect(workspace.runtimes[0]?.status).toBe("offline");
  });

  test("allows a runtime daemon to host multiple agents with name and description prompts", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const firstAgent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Incident Commander",
      description: "Own incident triage, summarize impact, and coordinate next actions."
    });

    const secondAgent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployment health, rollback risk, and release notes."
    });

    expect(firstAgent.runtimeId).toBe(runtime.id);
    expect(secondAgent.runtimeId).toBe(runtime.id);
    expect(workspace.agents).toHaveLength(2);
    expect(workspace.agents.map((agent) => agent.name)).toEqual(["Incident Commander", "Deploy Analyst"]);
  });

  test("stores execution runtime preferences for an agent", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Incident Commander",
      description: "Own incident triage, summarize impact, and coordinate next actions.",
      implementation: "codex",
      model: "gpt-5.4",
      reasoningEffort: "high"
    });

    expect(agent.implementation).toBe("codex");
    expect(agent.model).toBe("gpt-5.4");
    expect(agent.reasoningEffort).toBe("high");
    expect(agent.status).toBe("running");
    expect(agent.channelId.startsWith("dir_")).toBe(true);
  });

  test("queues stop and delete control actions for an agent", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Incident Commander",
      description: "Own incident triage, summarize impact, and coordinate next actions."
    });

    const stopAction = queueAgentControlAction(workspace, {
      agentId: agent.id,
      action: "stop",
      now: "2025-01-01T00:00:00.000Z"
    });

    expect(stopAction.action).toBe("stop");
    expect(workspace.agents.find((entry) => entry.id === agent.id)?.status).toBe("stopped");

    const deleteAction = queueAgentControlAction(workspace, {
      agentId: agent.id,
      action: "delete",
      now: "2025-01-01T00:01:00.000Z"
    });

    expect(deleteAction.action).toBe("delete");
    expect(workspace.agents.find((entry) => entry.id === agent.id)?.status).toBe("deleted");

    acknowledgeAgentControlAction(workspace, {
      actionId: stopAction.id,
      now: "2025-01-01T00:02:00.000Z"
    });

    expect(workspace.agentControlActions.find((entry) => entry.id === stopAction.id)?.acknowledgedAt).toBe(
      "2025-01-01T00:02:00.000Z"
    );
  });

  test("soft deletes a runtime and marks its agents as deleted", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const firstAgent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Incident Commander",
      description: "Own incident triage."
    });

    const secondAgent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployments."
    });

    const issue = createIssue(workspace, {
      actorId: "usr_admin",
      title: "Keep assigned issue",
      description: "Should become unassigned after runtime removal.",
      assigneeId: firstAgent.id
    });

    softDeleteRuntimeDaemon(workspace, {
      runtimeId: runtime.id,
      actorId: "usr_admin",
      now: "2025-01-01T00:03:00.000Z"
    });

    expect(workspace.runtimes.find((entry) => entry.id === runtime.id)?.status).toBe("deleted");
    expect(workspace.agents.find((entry) => entry.id === firstAgent.id)?.status).toBe("deleted");
    expect(workspace.agents.find((entry) => entry.id === secondAgent.id)?.status).toBe("deleted");
    expect(workspace.issues.find((entry) => entry.id === issue.id)?.assigneeId).toBeNull();
  });

  test("claims assigned runtime issues for running agents and marks them in progress", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployment failures."
    });

    const firstMessage = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Investigate the failed deploy.",
      senderId: "usr_123",
      senderType: "user"
    });

    const secondMessage = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Check whether rollback is safe.",
      senderId: "usr_123",
      senderType: "user"
    });

    const issue = createIssueFromMessages(workspace, {
      actorId: "usr_123",
      assigneeId: agent.id,
      messageIds: [firstMessage.id, secondMessage.id],
      title: "Investigate failed deploy batch",
      description: "Summarize failure cause, rollback risk, and next action."
    });

    const claims = claimRuntimeIssues(workspace, {
      runtimeId: runtime.id,
      limit: 10,
      now: "2025-01-01T00:03:00.000Z"
    });

    expect(claims).toHaveLength(1);
    expect(claims[0]?.issue.id).toBe(issue.id);
    expect(claims[0]?.agent.id).toBe(agent.id);
    expect(claims[0]?.sourceMessages.map((message) => message.id)).toEqual([firstMessage.id, secondMessage.id]);
    expect(workspace.issues.find((entry) => entry.id === issue.id)?.status).toBe("in_progress");
  });

  test("records agent issue events and writes an agent-authored message", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployment failures."
    });

    const message = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Investigate the failed deploy and report back.",
      senderId: "usr_123",
      senderType: "user"
    });

    const issue = createIssueFromMessage(workspace, {
      actorId: "usr_123",
      assigneeId: agent.id,
      messageId: message.id,
      title: "Investigate failed deploy"
    });

    claimRuntimeIssues(workspace, {
      runtimeId: runtime.id,
      now: "2025-01-01T00:04:00.000Z"
    });

    const result = recordAgentIssueEvent(workspace, {
      agentId: agent.id,
      issueId: issue.id,
      status: "done",
      message: "Investigation complete. Rollback is safe.",
      occurredAt: "2025-01-01T00:05:00.000Z"
    });

    expect(result.issue.status).toBe("done");
    expect(result.message?.senderType).toBe("agent");
    expect(result.message?.content).toContain("Rollback is safe");
  });

  test("claims direct-thread user messages for runtime-owned agents", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Coder",
      description: "Writes repository changes."
    });

    const message = createMessage(workspace, {
      channelId: agent.channelId,
      content: "Can you explain why the test is failing?",
      senderId: "usr_123",
      senderType: "user"
    });

    const claims = claimRuntimeAgentMessages(workspace, {
      runtimeId: runtime.id,
      limit: 10,
      now: "2025-01-01T00:06:00.000Z"
    });

    expect(claims).toHaveLength(1);
    expect(claims[0]?.agent.id).toBe(agent.id);
    expect(claims[0]?.sourceMessage.id).toBe(message.id);

    const secondClaims = claimRuntimeAgentMessages(workspace, {
      runtimeId: runtime.id,
      limit: 10,
      now: "2025-01-01T00:07:00.000Z"
    });

    expect(secondClaims).toEqual([]);
  });

  test("records agent direct-message responses on the same thread", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Coder",
      description: "Writes repository changes."
    });

    const sourceMessage = createMessage(workspace, {
      channelId: agent.channelId,
      content: "Please review this file and tell me what is wrong.",
      senderId: "usr_123",
      senderType: "user"
    });

    claimRuntimeAgentMessages(workspace, {
      runtimeId: runtime.id,
      now: "2025-01-01T00:08:00.000Z"
    });

    const response = recordAgentMessageResponse(workspace, {
      agentId: agent.id,
      sourceMessageId: sourceMessage.id,
      content: "The failing branch never updates the expected value.",
      occurredAt: "2025-01-01T00:09:00.000Z"
    });

    expect(response.senderId).toBe(agent.id);
    expect(response.senderType).toBe("agent");
    expect(response.channelId).toBe(agent.channelId);
    expect(response.content).toContain("expected value");
  });

  test("creates an issue from one message and stores the canonical fields", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployment failures."
    });

    const message = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Investigate the failed deploy and report back.",
      senderId: "usr_123",
      senderType: "user"
    });

    const issue = createIssueFromMessage(workspace, {
      actorId: "usr_123",
      assigneeId: agent.id,
      messageId: message.id,
      title: "Investigate failed deploy",
      priority: "high",
      project: "ops"
    });

    expect(issue.status).toBe("todo");
    expect(issue.assigneeId).toBe(agent.id);
    expect(issue.creatorId).toBe("usr_123");
    expect(issue.priority).toBe("high");
    expect(issue.project).toBe("ops");
    expect(issue.sourceChannelId).toBe("chn_ops");
  });

  test("creates one aggregated issue from multiple source messages", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const token = createRuntimeRegistrationToken(workspace, {
      actorId: "usr_admin",
      actorRole: "admin"
    });

    const runtime = registerRuntimeDaemon(workspace, {
      registrationToken: token.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const agent = createAgentProfile(workspace, {
      runtimeId: runtime.id,
      name: "Deploy Analyst",
      description: "Investigate deployment failures."
    });

    const firstMessage = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Investigate the failed deploy.",
      senderId: "usr_123",
      senderType: "user"
    });

    const secondMessage = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Check whether rollback is safe.",
      senderId: "usr_123",
      senderType: "user"
    });

    const issue = createIssueFromMessages(workspace, {
      actorId: "usr_123",
      assigneeId: agent.id,
      messageIds: [firstMessage.id, secondMessage.id],
      title: "Investigate failed deploy batch",
      description: "Summarize failure cause, rollback risk, and next action.",
      dueDate: "2025-01-03T00:00:00.000Z"
    });

    expect(issue.description).toBe("Summarize failure cause, rollback risk, and next action.");
    expect(issue.status).toBe("todo");
    expect(issue.dueDate).toBe("2025-01-03T00:00:00.000Z");
    expect(issue.sourceChannelId).toBe("chn_ops");
  });

  test("supports global issues without a source channel", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const issue = createIssue(workspace, {
      actorId: "usr_123",
      title: "Global backlog item",
      description: "Track cross-workspace cleanup.",
      assigneeId: null
    });

    expect(issue.sourceChannelId).toBeNull();
    expect(issue.assigneeId).toBeNull();
    expect(issue.status).toBe("backlog");
  });

  test("creates a message with image and file attachments", () => {
    const workspace = createWorkspaceSnapshot({
      organizationId: "org_123"
    });

    const message = createMessage(workspace, {
      channelId: "chn_ops",
      content: "Sharing logs and the screenshot from the failed rollout.",
      senderId: "usr_123",
      senderType: "user",
      attachments: [
        {
          name: "rollout.png",
          mediaType: "image/png",
          size: 2048,
          kind: "image",
          dataUrl: "data:image/png;base64,AAAA"
        },
        {
          name: "server.log",
          mediaType: "text/plain",
          size: 512,
          kind: "file",
          dataUrl: "data:text/plain;base64,Qm9vbQ=="
        }
      ]
    });

    expect(message.attachments).toHaveLength(2);
    expect(message.attachments[0]?.kind).toBe("image");
    expect(message.attachments[1]?.name).toBe("server.log");
  });
});

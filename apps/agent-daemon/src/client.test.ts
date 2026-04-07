import { describe, expect, test } from "bun:test";
import { TEST_ORG_ID } from "@workpilot/shared";
import { createControlPlaneApp } from "../../control-plane/src/app";
import {
  acknowledgeAgentControlAction,
  getRuntimeControlActions,
  pullRuntimeAgentMessages,
  pullRuntimeIssues,
  recordAgentMessageResponse,
  recordAgentRunLog,
  recordAgentIssueEvent,
  registerRuntimeDaemon,
  sendRuntimeHeartbeat
} from "./client";

describe("agent daemon client", () => {
  test("registers a daemon node with the control-plane", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const tokenResponse = await app.request(`/organizations/${TEST_ORG_ID}/runtime-registration-tokens`, {
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

    const registration = await registerRuntimeDaemon({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      registrationToken: tokenPayload.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    expect(registration.runtime.name).toBe("ops-runtime");
    expect(registration.runtime.status).toBe("pending");
    expect(registration.credential.token.startsWith("cred_")).toBe(true);
  });

  test("sends heartbeats for a registered daemon node", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const tokenResponse = await app.request(`/organizations/${TEST_ORG_ID}/runtime-registration-tokens`, {
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

    const registration = await registerRuntimeDaemon({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      registrationToken: tokenPayload.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const heartbeat = await sendRuntimeHeartbeat({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      runtimeId: registration.runtime.id,
      occurredAt: "2025-01-01T00:00:00.000Z"
    });

    expect(heartbeat.runtime.status).toBe("online");
  });

  test("polls runtime control actions and acknowledges them", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const tokenResponse = await app.request(`/organizations/${TEST_ORG_ID}/runtime-registration-tokens`, {
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

    const registration = await registerRuntimeDaemon({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      registrationToken: tokenPayload.token,
      runtimeName: "ops-runtime",
      runtimeKey: "runtime_001"
    });

    const createAgentResponse = await app.request(`/runtimes/${registration.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Coder",
        description: "Writes repository changes.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });
    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: { id: string };
    };

    await app.request(`/agents/${createAgentPayload.agent.id}/control`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "restart",
        restartMode: "reset_session"
      })
    });

    const actions = await getRuntimeControlActions({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      runtimeId: registration.runtime.id
    });

    expect(actions.actions).toHaveLength(1);
    expect(actions.actions[0]?.action).toBe("restart");
    expect(actions.actions[0]?.restartMode).toBe("reset_session");

    const ack = await acknowledgeAgentControlAction({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      actionId: actions.actions[0]!.id
    });

    expect(ack.action.acknowledgedAt).toBeTruthy();
  });

  test("pulls runtime issues and records issue events", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

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

    const claims = await pullRuntimeIssues({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(claims.claims).toHaveLength(1);
    expect(claims.claims[0]?.issue.id).toBe(issuePayload.issue.id);
    expect(claims.claims[0]?.agent.id).toBe("agt_seed");

    const event = await recordAgentIssueEvent({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      agentId: "agt_seed",
      issueId: issuePayload.issue.id,
      status: "done",
      message: "Deployment issue triaged."
    });

    expect(event.issue.status).toBe("done");
    expect(event.message?.senderType).toBe("agent");
  });

  test("pulls direct agent messages and records agent replies", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const messageResponse = await app.request("/channels/dir_admin_ops/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "What broke in the deploy?",
        senderId: "usr_admin",
        senderType: "user"
      })
    });
    const messagePayload = (await messageResponse.json()) as {
      message: { id: string };
    };

    const claims = await pullRuntimeAgentMessages({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      runtimeId: "rtm_seed",
      limit: 10
    });

    expect(claims.claims).toHaveLength(1);
    expect(claims.claims[0]?.agent.id).toBe("agt_seed");
    expect(claims.claims[0]?.agent.channelId).toBe("dir_admin_ops");
    expect(claims.claims[0]?.sourceMessage.id).toBe(messagePayload.message.id);
    expect(claims.claims[0]?.isFirstUserMessage).toBe(true);

    const event = await recordAgentMessageResponse({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      agentId: "agt_seed",
      sourceMessageId: messagePayload.message.id,
      content: "The deploy failed during the health-check step."
    });

    expect(event.message.senderType).toBe("agent");
    expect(event.message.channelId).toBe("dir_admin_ops");
  });

  test("records agent run logs for later inspection", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });

    const result = await recordAgentRunLog({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      agentId: "agt_seed",
      runtimeId: "rtm_seed",
      channelId: "dir_admin_ops",
      sessionId: "ses_debug",
      kind: "direct_message",
      prompt: "What broke in the deploy?",
      response: "The health-check timed out."
    });

    expect(result.log.agentId).toBe("agt_seed");
    expect(result.log.sessionId).toBe("ses_debug");
    expect(result.log.prompt).toContain("deploy");
    expect(result.log.response).toContain("timed out");
  });
});

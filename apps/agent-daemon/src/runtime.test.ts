import { describe, expect, test } from "bun:test";
import { createControlPlaneApp } from "../../control-plane/src/app";
import type { AgentIdentity } from "@workpilot/shared";
import { registerRuntimeDaemon, type DaemonFetcher } from "./client";
import {
  createDaemonRuntime,
  type DaemonAgentHost,
  type DaemonRuntimeScheduler,
  type DaemonStateStore
} from "./runtime";

class MemoryStateStore implements DaemonStateStore {
  private state: Awaited<ReturnType<DaemonStateStore["load"]>> = null;

  async load() {
    return this.state;
  }

  async save(state: NonNullable<Awaited<ReturnType<DaemonStateStore["load"]>>>) {
    this.state = state;
  }
}

class RecordingAgentHost implements DaemonAgentHost {
  readonly syncCalls: AgentIdentity[][] = [];
  readonly runCalls: Array<{ agentId: string; prompt: string }> = [];
  readonly setStatusCalls: Array<{ agentId: string; status: AgentIdentity["status"] }> = [];
  readonly restartCalls: Array<{ agentId: string; mode: "restart" | "reset_session" | "full_reset" | null }> = [];
  readonly deleteCalls: string[] = [];
  started = false;
  stopped = false;

  async start() {
    this.started = true;
  }

  async syncAgents(agents: AgentIdentity[]) {
    this.syncCalls.push(agents);
  }

  async run(agent: AgentIdentity, prompt: string) {
    this.runCalls.push({
      agentId: agent.id,
      prompt
    });

    return {
      sessionId: "ses_demo",
      implementationPackage:
        agent.implementation === "codex" ? "@rivet-dev/agent-os-codex-agent" : "@rivet-dev/agent-os-claude",
      responseText: `Reply from ${agent.name}: ${prompt.slice(0, 32)}`
    };
  }

  async setAgentStatus(agentId: string, status: AgentIdentity["status"]) {
    this.setStatusCalls.push({ agentId, status });
  }

  async restartAgent(agentId: string, mode: "restart" | "reset_session" | "full_reset" | null) {
    this.restartCalls.push({ agentId, mode });
  }

  async deleteAgent(agentId: string) {
    this.deleteCalls.push(agentId);
  }

  async stop() {
    this.stopped = true;
  }
}

class ManualScheduler implements DaemonRuntimeScheduler {
  callback: (() => Promise<void>) | null = null;
  intervalMs: number | null = null;
  stopped = false;

  scheduleEvery(callback: () => Promise<void>, intervalMs: number) {
    this.callback = callback;
    this.intervalMs = intervalMs;

    return {
      stop: () => {
        this.stopped = true;
      }
    };
  }

  async tick() {
    if (!this.callback) {
      throw new Error("Scheduler callback was not registered.");
    }

    await this.callback();
  }
}

class RecordingAgentActivityReporter {
  readonly calls: Array<{
    agentId: string;
    status: "idle" | "running";
    summary: string;
    detail?: string;
  }> = [];

  async record(input: { agentId: string; status: "idle" | "running"; summary: string; detail?: string }) {
    this.calls.push(input);
    return {
      activity: {
        agentId: input.agentId,
        status: input.status,
        summary: input.summary,
        detail: input.detail ?? null,
        updatedAt: "2025-04-03T22:19:08.000Z"
      }
    };
  }
}

async function issueRegistrationToken(fetcher: DaemonFetcher) {
  const response = await fetcher(
    new Request("http://control-plane.local/organizations/org_demo/runtime-registration-tokens", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        actorRole: "admin"
      })
    })
  );

  const payload = (await response.json()) as { token: string };

  return payload.token;
}

describe("daemon runtime", () => {
  test("reuses persisted runtime registration on restart", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const scheduler = new ManualScheduler();
    const firstHost = new RecordingAgentHost();

    const registrationToken = await issueRegistrationToken(app.fetch);

    const firstRuntime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken,
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: firstHost,
        scheduler
      }
    );

    await firstRuntime.start();
    const firstState = await stateStore.load();

    expect(firstState?.runtimeId).toBeDefined();

    await firstRuntime.stop();

    const secondRuntime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken,
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: new RecordingAgentHost(),
        scheduler: new ManualScheduler()
      }
    );

    await expect(secondRuntime.start()).resolves.toBeUndefined();

    const secondState = await stateStore.load();
    expect(secondState?.runtimeId).toBe(firstState?.runtimeId);

    await secondRuntime.stop();
  });

  test("sends the initial heartbeat and keeps a scheduled heartbeat loop", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const scheduler = new ManualScheduler();
    const heartbeatCalls: string[] = [];
    const registrationToken = await issueRegistrationToken(app.fetch);

    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken,
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 15_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: new RecordingAgentHost(),
        scheduler,
        sendHeartbeat: async (input) => {
          heartbeatCalls.push(input.runtimeId);
          return await runtime.client.sendHeartbeat(input);
        }
      }
    );

    await runtime.start();

    expect(scheduler.intervalMs).toBe(15_000);
    expect(heartbeatCalls).toHaveLength(1);

    await scheduler.tick();

    expect(heartbeatCalls).toHaveLength(2);

    const runtimeId = (await stateStore.load())?.runtimeId;
    expect(runtimeId).toBeDefined();

    const bootstrap = await runtime.client.getWorkspaceBootstrap({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch
    });
    const registeredRuntime = bootstrap.runtimes.find((entry) => entry.id === runtimeId);

    expect(registeredRuntime?.status).toBe("online");

    await runtime.stop();
  });

  test("syncs only current runtime agents and skips redundant host updates", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const registrationToken = await issueRegistrationToken(app.fetch);

    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken,
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;
    expect(currentRuntimeId).toBeDefined();

    const secondToken = await issueRegistrationToken(app.fetch);
    const secondRuntime = await registerRuntimeDaemon({
      controlPlaneUrl: "http://control-plane.local",
      fetcher: app.fetch,
      registrationToken: secondToken,
      runtimeName: "research-runtime",
      runtimeKey: "runtime_002"
    });

    await app.request(`/runtimes/${currentRuntimeId}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Planner",
        description: "Plans and scopes implementation work."
      })
    });

    await app.request(`/runtimes/${secondRuntime.runtime.id}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Reviewer",
        description: "Reviews code owned by a different runtime."
      })
    });

    await runtime.refreshAgents();

    expect(host.syncCalls).toHaveLength(2);
    expect(host.syncCalls.at(-1)?.map((agent) => agent.name)).toEqual(["Planner"]);

    await runtime.refreshAgents();

    expect(host.syncCalls).toHaveLength(2);

    await runtime.stop();
  });

  test("resyncs agents after the same runtime instance is restarted", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler: new ManualScheduler()
      }
    );

    await runtime.start();
    await runtime.stop();
    await runtime.start();

    expect(host.syncCalls).toHaveLength(2);

    await runtime.stop();
  });

  test("runs prompts against a runtime-owned agent implementation", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler: new ManualScheduler()
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;

    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
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
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();
    const result = await runtime.runAgentPrompt(createAgentPayload.agent.id, "Implement the requested feature.");

    expect(host.runCalls).toEqual([
      {
        agentId: createAgentPayload.agent.id,
        prompt: "Implement the requested feature."
      }
    ]);
    expect(result).toEqual({
      implementationPackage: "@rivet-dev/agent-os-codex-agent",
      responseText: "Reply from Coder: Implement the requested feature.",
      sessionId: "ses_demo"
    });

    await runtime.stop();
  });

  test("polls control actions and applies them to the local host", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;

    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
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
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();

    await app.request(`/agents/${createAgentPayload.agent.id}/control`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "stop"
      })
    });
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
    await app.request(`/agents/${createAgentPayload.agent.id}/control`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        action: "delete"
      })
    });

    await scheduler.tick();

    expect(host.setStatusCalls).toContainEqual({
      agentId: createAgentPayload.agent.id,
      status: "stopped"
    });
    expect(host.restartCalls).toContainEqual({
      agentId: createAgentPayload.agent.id,
      mode: "reset_session"
    });
    expect(host.deleteCalls).toContain(createAgentPayload.agent.id);

    const actionResponse = await app.request(`/runtimes/${currentRuntimeId}/control-actions`);
    const actionPayload = (await actionResponse.json()) as {
      actions: Array<{ id: string }>;
    };

    expect(actionPayload.actions).toHaveLength(0);

    await runtime.stop();
  });

  test("polls assigned runtime issues and dispatches them through runAgentPrompt", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;

    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
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
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();

    const messageResponse = await app.request("/channels/chn_general/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Please implement the requested feature and summarize the result.",
        senderId: "usr_admin",
        senderType: "user"
      })
    });
    const messagePayload = (await messageResponse.json()) as {
      message: { id: string };
    };

    const issueResponse = await app.request(`/messages/${messagePayload.message.id}/issues`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        actorId: "usr_admin",
        assigneeId: createAgentPayload.agent.id,
        title: "Implement requested feature"
      })
    });
    const issuePayload = (await issueResponse.json()) as {
      issue: { id: string };
    };

    await scheduler.tick();

    expect(host.runCalls).toHaveLength(1);
    expect(host.runCalls[0]?.agentId).toBe(createAgentPayload.agent.id);
    expect(host.runCalls[0]?.prompt).toContain("Implement requested feature");

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      issues: Array<{ id: string; status: string }>;
      messages: Array<{ senderId: string; senderType: string; content: string }>;
    };

    expect(bootstrapPayload.issues.find((issue) => issue.id === issuePayload.issue.id)?.status).toBe("done");
    expect(
      bootstrapPayload.messages.some(
        (message) =>
          message.senderId === createAgentPayload.agent.id &&
          message.senderType === "agent" &&
          message.content.includes("Reply from Coder")
      )
    ).toBe(true);

    await runtime.stop();
  });

  test("polls direct agent-thread messages and records the real agent reply", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;
    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Coder",
        description: "Answers direct engineering questions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });
    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();

    const messageResponse = await app.request(`/channels/${createAgentPayload.agent.channelId}/messages`, {
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
    const messagePayload = (await messageResponse.json()) as {
      message: { id: string };
    };

    await scheduler.tick();

    expect(host.runCalls).toHaveLength(1);
    expect(host.runCalls[0]?.agentId).toBe(createAgentPayload.agent.id);
    expect(host.runCalls[0]?.prompt).toContain("Why did the deploy fail?");
    expect(host.runCalls[0]?.prompt).toContain("Authoritative agent profile for this conversation:");
    expect(host.runCalls[0]?.prompt).toContain("Answers direct engineering questions.");

    const bootstrapResponse = await app.request("/bootstrap/workspace");
    const bootstrapPayload = (await bootstrapResponse.json()) as {
      messages: Array<{ id: string; channelId: string; senderId: string; senderType: string; content: string }>;
    };

    expect(
      bootstrapPayload.messages.some(
        (message) =>
          message.id !== messagePayload.message.id &&
          message.channelId === createAgentPayload.agent.channelId &&
          message.senderId === createAgentPayload.agent.id &&
          message.senderType === "agent" &&
          message.content.includes("Reply from Coder")
      )
    ).toBe(true);

    await runtime.stop();
  });

  test("injects the agent description only on the first direct-message turn", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;
    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Coder",
        description: "Answers direct engineering questions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });
    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();

    await app.request(`/channels/${createAgentPayload.agent.channelId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "First question",
        senderId: "usr_admin",
        senderType: "user"
      })
    });

    await scheduler.tick();

    await app.request(`/channels/${createAgentPayload.agent.channelId}/messages`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        content: "Second question",
        senderId: "usr_admin",
        senderType: "user"
      })
    });

    await scheduler.tick();

    expect(host.runCalls).toHaveLength(2);
    expect(host.runCalls[0]?.prompt).toContain("Authoritative agent profile for this conversation:");
    expect(host.runCalls[1]?.prompt).not.toContain("Authoritative agent profile for this conversation:");

    await runtime.stop();
  });

  test("reports agent activity while processing direct messages", async () => {
    const app = createControlPlaneApp({
      controlPlaneUrl: "http://control-plane.local"
    });
    const stateStore = new MemoryStateStore();
    const host = new RecordingAgentHost();
    const scheduler = new ManualScheduler();
    const activityReporter = new RecordingAgentActivityReporter();
    const runtime = createDaemonRuntime(
      {
        controlPlaneUrl: "http://control-plane.local",
        registrationToken: await issueRegistrationToken(app.fetch),
        nodeName: "ops-runtime",
        agentKey: "runtime_001",
        heartbeatIntervalMs: 30_000,
        statePath: "/tmp/workpilot-agent-daemon/state.json",
        workspaceRoot: "/tmp/workpilot-agent-daemon/workspace"
      },
      {
        fetcher: app.fetch,
        stateStore,
        agentHost: host,
        scheduler,
        recordAgentActivity: (input) => activityReporter.record(input)
      }
    );

    await runtime.start();

    const currentRuntimeId = (await stateStore.load())?.runtimeId;
    const createAgentResponse = await app.request(`/runtimes/${currentRuntimeId}/agents`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name: "Coder",
        description: "Answers direct engineering questions.",
        implementation: "codex",
        model: "gpt-5.4",
        reasoningEffort: "high"
      })
    });
    const createAgentPayload = (await createAgentResponse.json()) as {
      agent: AgentIdentity;
    };

    await runtime.refreshAgents();

    await app.request(`/channels/${createAgentPayload.agent.channelId}/messages`, {
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

    await scheduler.tick();

    expect(activityReporter.calls).toHaveLength(2);
    expect(activityReporter.calls[0]).toMatchObject({
      agentId: createAgentPayload.agent.id,
      status: "running"
    });
    expect(activityReporter.calls[1]).toMatchObject({
      agentId: createAgentPayload.agent.id,
      status: "idle"
    });

    await runtime.stop();
  });
});

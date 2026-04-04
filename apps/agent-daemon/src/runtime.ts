import type { AgentIdentity, RuntimeAgentMessageClaimDTO, RuntimeIssueClaimDTO } from "@workpilot/shared";
import { createSandboxAgentHost, type DaemonAgentHost } from "./agent-host";
import {
  acknowledgeAgentControlAction,
  getRuntimeControlActions,
  getWorkspaceBootstrap,
  pullRuntimeAgentMessages,
  pullRuntimeIssues,
  recordAgentActivity,
  recordAgentMessageResponse,
  recordAgentIssueEvent,
  registerRuntimeDaemon,
  sendRuntimeHeartbeat,
  type DaemonFetcher,
  type AgentMessageEventResponse,
  type AcknowledgeAgentControlActionInput,
  type GetWorkspaceBootstrapInput,
  type GetRuntimeControlActionsInput,
  type PullRuntimeAgentMessagesInput,
  type PullRuntimeIssuesInput,
  type RegisterRuntimeDaemonInput,
  type AgentIssueEventResponse,
  type AgentActivityEventResponse,
  type SendRuntimeHeartbeatInput
} from "./client";
import { createFileDaemonStateStore, type DaemonState, type DaemonStateStore } from "./state";

export type { DaemonAgentHost } from "./agent-host";
export type { DaemonState, DaemonStateStore } from "./state";

export interface DaemonRuntimeConfig {
  controlPlaneUrl: string;
  registrationToken: string;
  nodeName: string;
  agentKey: string;
  heartbeatIntervalMs: number;
  statePath: string;
  workspaceRoot: string;
}

export interface DaemonRuntimeScheduler {
  scheduleEvery(callback: () => Promise<void>, intervalMs: number): {
    stop(): void;
  };
}

interface DaemonRuntimeDependencies {
  fetcher?: DaemonFetcher;
  stateStore?: DaemonStateStore;
  agentHost?: DaemonAgentHost;
  createAgentHost?: (state: DaemonState) => Promise<DaemonAgentHost> | DaemonAgentHost;
  scheduler?: DaemonRuntimeScheduler;
  registerRuntime?: (input: RegisterRuntimeDaemonInput) => Promise<Awaited<ReturnType<typeof registerRuntimeDaemon>>>;
  sendHeartbeat?: (input: SendRuntimeHeartbeatInput) => Promise<Awaited<ReturnType<typeof sendRuntimeHeartbeat>>>;
  getWorkspaceBootstrap?: (
    input: GetWorkspaceBootstrapInput
  ) => Promise<Awaited<ReturnType<typeof getWorkspaceBootstrap>>>;
  getRuntimeControlActions?: (
    input: GetRuntimeControlActionsInput
  ) => Promise<Awaited<ReturnType<typeof getRuntimeControlActions>>>;
  acknowledgeAgentControlAction?: (
    input: AcknowledgeAgentControlActionInput
  ) => Promise<Awaited<ReturnType<typeof acknowledgeAgentControlAction>>>;
  pullRuntimeIssues?: (
    input: PullRuntimeIssuesInput
  ) => Promise<Awaited<ReturnType<typeof pullRuntimeIssues>>>;
  pullRuntimeAgentMessages?: (
    input: PullRuntimeAgentMessagesInput
  ) => Promise<Awaited<ReturnType<typeof pullRuntimeAgentMessages>>>;
  recordAgentIssueEvent?: (
    input: DaemonFetchContextualIssueEventInput
  ) => Promise<AgentIssueEventResponse>;
  recordAgentActivity?: (input: DaemonFetchContextualAgentActivityInput) => Promise<AgentActivityEventResponse>;
  recordAgentMessageResponse?: (
    input: DaemonFetchContextualAgentMessageInput
  ) => Promise<AgentMessageEventResponse>;
}

type DaemonFetchContextualIssueEventInput = Parameters<typeof recordAgentIssueEvent>[0];
type DaemonFetchContextualAgentActivityInput = Parameters<typeof recordAgentActivity>[0];
type DaemonFetchContextualAgentMessageInput = Parameters<typeof recordAgentMessageResponse>[0];

export interface DaemonRuntime {
  readonly client: {
    sendHeartbeat: typeof sendRuntimeHeartbeat;
    getWorkspaceBootstrap: typeof getWorkspaceBootstrap;
  };
  start(): Promise<void>;
  refreshAgents(): Promise<AgentIdentity[]>;
  runAgentPrompt(agentId: string, prompt: string): Promise<{
    sessionId: string;
    implementationPackage: string;
    responseText: string;
  }>;
  stop(): Promise<void>;
}

export function createDaemonRuntime(
  config: DaemonRuntimeConfig,
  dependencies: DaemonRuntimeDependencies = {}
): DaemonRuntime {
  const stateStore = dependencies.stateStore ?? createFileDaemonStateStore(config.statePath);
  const scheduler = dependencies.scheduler ?? createIntervalScheduler();
  const registerRuntime = dependencies.registerRuntime ?? registerRuntimeDaemon;
  const sendHeartbeat = dependencies.sendHeartbeat ?? sendRuntimeHeartbeat;
  const loadWorkspaceBootstrap = dependencies.getWorkspaceBootstrap ?? getWorkspaceBootstrap;
  const loadRuntimeControlActions = dependencies.getRuntimeControlActions ?? getRuntimeControlActions;
  const acknowledgeControlAction = dependencies.acknowledgeAgentControlAction ?? acknowledgeAgentControlAction;
  const loadRuntimeIssues = dependencies.pullRuntimeIssues ?? pullRuntimeIssues;
  const loadRuntimeAgentMessages = dependencies.pullRuntimeAgentMessages ?? pullRuntimeAgentMessages;
  const sendIssueEvent = dependencies.recordAgentIssueEvent ?? recordAgentIssueEvent;
  const sendActivityEvent = dependencies.recordAgentActivity ?? recordAgentActivity;
  const sendAgentMessageResponse = dependencies.recordAgentMessageResponse ?? recordAgentMessageResponse;
  const providedAgentHost = dependencies.agentHost ?? null;

  let state: DaemonState | null = null;
  let agentHost = providedAgentHost;
  let heartbeatLoop: { stop(): void } | null = null;
  let syncedAgentSignature: string | null = null;
  let syncedAgents = new Map<string, AgentIdentity>();

  async function resolveState(): Promise<DaemonState> {
    const storedState = await stateStore.load();

    if (
      storedState &&
      storedState.controlPlaneUrl === config.controlPlaneUrl &&
      storedState.runtimeKey === config.agentKey
    ) {
      return storedState;
    }

    const registration = await registerRuntime({
      controlPlaneUrl: config.controlPlaneUrl,
      fetcher: dependencies.fetcher,
      registrationToken: config.registrationToken,
      runtimeName: config.nodeName,
      runtimeKey: config.agentKey
    });

    const nextState: DaemonState = {
      version: 1,
      controlPlaneUrl: config.controlPlaneUrl,
      runtimeId: registration.runtime.id,
      runtimeName: registration.runtime.name,
      runtimeKey: config.agentKey,
      credentialToken: registration.credential.token
    };

    await stateStore.save(nextState);

    return nextState;
  }

  async function getAgentHost(currentState: DaemonState): Promise<DaemonAgentHost> {
    if (!agentHost) {
      agentHost =
        (await dependencies.createAgentHost?.(currentState)) ??
        createSandboxAgentHost({
          runtimeId: currentState.runtimeId,
          runtimeName: currentState.runtimeName,
          workspaceRoot: config.workspaceRoot
        });
    }

    return agentHost;
  }

  async function sendHeartbeatNow() {
    if (!state) {
      return;
    }

    console.log("[daemon] sending heartbeat", {
      runtimeId: state.runtimeId,
      runtimeName: state.runtimeName
    });
    await sendHeartbeat({
      controlPlaneUrl: config.controlPlaneUrl,
      fetcher: dependencies.fetcher,
      runtimeId: state.runtimeId
    });
  }

  const runtime: DaemonRuntime = {
    client: {
      sendHeartbeat: sendRuntimeHeartbeat,
      getWorkspaceBootstrap
    },
    async start() {
      if (heartbeatLoop) {
        return;
      }

      state = await resolveState();
      console.log("[daemon] runtime started", {
        runtimeId: state.runtimeId,
        runtimeName: state.runtimeName,
        controlPlaneUrl: config.controlPlaneUrl
      });

      const host = await getAgentHost(state);
      await host.start();
      await sendHeartbeatNow();
      await this.refreshAgents();
      await pollControlActions();
      await pollIssues();
      await pollAgentMessages();

      heartbeatLoop = scheduler.scheduleEvery(async () => {
        await sendHeartbeatNow();
        await this.refreshAgents();
        await pollControlActions();
        await pollIssues();
        await pollAgentMessages();
      }, config.heartbeatIntervalMs);
    },
    async refreshAgents() {
      if (!state) {
        state = await resolveState();
      }

      const bootstrap = await loadWorkspaceBootstrap({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher
      });
      const agents = bootstrap.agents
        .filter((agent) => agent.runtimeId === state?.runtimeId)
        .sort((left, right) => left.id.localeCompare(right.id));
      console.log("[daemon] refresh agents", {
        runtimeId: state.runtimeId,
        count: agents.length,
        agentIds: agents.map((agent) => agent.id)
      });
      const signature = JSON.stringify(
        agents.map((agent) => ({
          id: agent.id,
          channelId: agent.channelId,
          name: agent.name,
          description: agent.description,
          implementation: agent.implementation,
          model: agent.model,
          reasoningEffort: agent.reasoningEffort,
          status: agent.status
        }))
      );

      if (signature === syncedAgentSignature) {
        return agents;
      }

      const host = await getAgentHost(state);
      await host.syncAgents(agents);
      syncedAgentSignature = signature;
      syncedAgents = new Map(agents.map((agent) => [agent.id, agent]));

      return agents;
    },
    async runAgentPrompt(agentId, prompt) {
      if (!state) {
        state = await resolveState();
      }

      let agent = syncedAgents.get(agentId);

      if (!agent) {
        const agents = await this.refreshAgents();
        agent = agents.find((entry) => entry.id === agentId);
      }

      if (!agent || agent.runtimeId !== state.runtimeId) {
        throw new Error("Agent was not found on this runtime.");
      }

      const host = await getAgentHost(state);

      console.log("[daemon] run agent prompt", {
        runtimeId: state.runtimeId,
        agentId,
        agentName: agent.name,
        promptLength: prompt.length
      });
      return await host.run(agent, prompt);
    },
    async stop() {
      heartbeatLoop?.stop();
      heartbeatLoop = null;

      if (!agentHost) {
        return;
      }

      await agentHost.stop();
      agentHost = providedAgentHost;
      syncedAgentSignature = null;
      syncedAgents = new Map();
    }
  };

  async function pollControlActions() {
    if (!state) {
      return;
    }

    const response = await loadRuntimeControlActions({
      controlPlaneUrl: config.controlPlaneUrl,
      fetcher: dependencies.fetcher,
      runtimeId: state.runtimeId
    });
    console.log("[daemon] polled control actions", {
      runtimeId: state.runtimeId,
      count: response.actions.length
    });
    const host = await getAgentHost(state);

    for (const action of response.actions) {
      console.log("[daemon] applying control action", {
        runtimeId: state.runtimeId,
        actionId: action.id,
        agentId: action.agentId,
        action: action.action,
        restartMode: action.restartMode ?? null
      });
      if (action.action === "start" || action.action === "stop") {
        await host.setAgentStatus(action.agentId, action.action === "start" ? "running" : "stopped");
      } else if (action.action === "restart") {
        await host.restartAgent(action.agentId, action.restartMode);
      } else if (action.action === "delete") {
        await host.deleteAgent(action.agentId);
      }

      await acknowledgeControlAction({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        actionId: action.id
      });
    }
  }

  async function pollIssues() {
    if (!state) {
      return;
    }

    const response = await loadRuntimeIssues({
      controlPlaneUrl: config.controlPlaneUrl,
      fetcher: dependencies.fetcher,
      runtimeId: state.runtimeId,
      limit: 10
    });
    console.log("[daemon] polled issues", {
      runtimeId: state.runtimeId,
      count: response.claims.length
    });

    for (const claim of response.claims) {
      await runIssueClaim(claim);
    }
  }

  async function pollAgentMessages() {
    if (!state) {
      return;
    }

    const response = await loadRuntimeAgentMessages({
      controlPlaneUrl: config.controlPlaneUrl,
      fetcher: dependencies.fetcher,
      runtimeId: state.runtimeId,
      limit: 10
    });
    console.log("[daemon] polled agent messages", {
      runtimeId: state.runtimeId,
      count: response.claims.length
    });

    for (const claim of response.claims) {
      await runMessageClaim(claim);
    }
  }

  async function runIssueClaim(claim: RuntimeIssueClaimDTO) {
    try {
      console.log("[daemon] issue claim received", {
        runtimeId: state?.runtimeId ?? null,
        issueId: claim.issue.id,
        title: claim.issue.title,
        agentId: claim.agent.id,
        agentName: claim.agent.name
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "running",
        summary: `${claim.agent.implementation === "codex" ? "Codex CLI" : claim.agent.name} is working on "${claim.issue.title}".`,
        detail: "Executing delegated issue work."
      });
      const result = await runtime.runAgentPrompt(claim.agent.id, buildIssuePrompt(claim));

      console.log("[daemon] issue claim completed", {
        runtimeId: state?.runtimeId ?? null,
        issueId: claim.issue.id,
        agentId: claim.agent.id,
        sessionId: result.sessionId,
        responseLength: result.responseText.length
      });
      await sendIssueEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        issueId: claim.issue.id,
        status: "done",
        message:
          result.responseText.trim() ||
          `Issue "${claim.issue.title}" completed in session ${result.sessionId} via ${result.implementationPackage}.`
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "idle",
        summary: `${claim.agent.name} is ready for the next task.`,
        detail: `Last issue finished in session ${result.sessionId}.`
      });
    } catch (error) {
      console.error("[daemon] issue claim failed", {
        runtimeId: state?.runtimeId ?? null,
        issueId: claim.issue.id,
        agentId: claim.agent.id,
        error: error instanceof Error ? error.message : String(error)
      });
      await sendIssueEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        issueId: claim.issue.id,
        status: "todo",
        message: error instanceof Error ? error.message : "Agent issue execution failed."
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "idle",
        summary: `${claim.agent.name} returned to idle after an issue failure.`,
        detail: error instanceof Error ? error.message : "Agent issue execution failed."
      });
    }
  }

  async function runMessageClaim(claim: RuntimeAgentMessageClaimDTO) {
    try {
      console.log("[daemon] direct message claim received", {
        runtimeId: state?.runtimeId ?? null,
        agentId: claim.agent.id,
        agentName: claim.agent.name,
        sourceMessageId: claim.sourceMessage.id,
        channelId: claim.sourceMessage.channelId,
        senderId: claim.sourceMessage.senderId,
        preview: claim.sourceMessage.content.slice(0, 120)
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "running",
        summary: `${claim.agent.implementation === "codex" ? "Codex CLI" : claim.agent.name} is replying in chat.`,
        detail: `Working on message ${claim.sourceMessage.id}.`
      });
      const result = await runtime.runAgentPrompt(claim.agent.id, buildDirectMessagePrompt(claim));

      console.log("[daemon] direct message completed", {
        runtimeId: state?.runtimeId ?? null,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        sessionId: result.sessionId,
        responseLength: result.responseText.length
      });
      await sendAgentMessageResponse({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        content:
          result.responseText.trim() ||
          `Completed response in session ${result.sessionId} via ${result.implementationPackage}.`
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "idle",
        summary: `${claim.agent.name} is ready for the next instruction.`,
        detail: `Last reply completed in session ${result.sessionId}.`
      });
      console.log("[daemon] direct message response recorded", {
        runtimeId: state?.runtimeId ?? null,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id
      });
    } catch (error) {
      console.error("[daemon] direct message failed", {
        runtimeId: state?.runtimeId ?? null,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        error: error instanceof Error ? error.message : String(error)
      });
      await sendAgentMessageResponse({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        content: error instanceof Error ? error.message : "Agent message execution failed."
      });
      await sendActivityEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        status: "idle",
        summary: `${claim.agent.name} returned to idle after a chat failure.`,
        detail: error instanceof Error ? error.message : "Agent message execution failed."
      });
      console.log("[daemon] direct message failure recorded", {
        runtimeId: state?.runtimeId ?? null,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id
      });
    }
  }

  function buildIssuePrompt(claim: RuntimeIssueClaimDTO) {
    const sourceMessages = claim.sourceMessages
      .map((message, index) => `${index + 1}. [${message.senderType}:${message.senderId}] ${message.content}`)
      .join("\n");

    return [
      `Issue: ${claim.issue.title}`,
      claim.issue.description ? `Description: ${claim.issue.description}` : null,
      `Assigned Agent: ${claim.agent.name}`,
      "Source Messages:",
      sourceMessages || "(none)"
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  function buildDirectMessagePrompt(claim: RuntimeAgentMessageClaimDTO) {
    return [
      claim.isFirstUserMessage
        ? [
            "Authoritative agent profile for this conversation:",
            `- Workspace agent record name: ${claim.agent.name}`,
            claim.agent.description ? `- Owner-defined prompt constraint: ${claim.agent.description}` : null,
            "- Follow the owner-defined profile above as the highest-priority in-chat identity and behavior for this session.",
            "- If the user asks your name, role, or what you help with, answer from the owner-defined profile above instead of generic platform defaults."
          ]
            .filter(Boolean)
            .join("\n")
        : null,
      "Reply naturally in this direct conversation with the user.",
      `User message: ${claim.sourceMessage.content}`
    ]
      .filter(Boolean)
      .join("\n\n");
  }

  return runtime;
}

function createIntervalScheduler(): DaemonRuntimeScheduler {
  return {
    scheduleEvery(callback, intervalMs) {
      const timer = setInterval(() => {
        void callback().catch((error) => {
          console.error("agent-daemon heartbeat loop failed", error);
        });
      }, intervalMs);

      return {
        stop() {
          clearInterval(timer);
        }
      };
    }
  };
}

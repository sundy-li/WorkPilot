import type { AgentIdentity, RuntimeAgentMessageClaimDTO, RuntimeIssueClaimDTO } from "@workpilot/shared";
import { createSandboxAgentHost, type DaemonAgentHost } from "./agent-host";
import {
  acknowledgeAgentControlAction,
  getRuntimeControlActions,
  getWorkspaceBootstrap,
  pullRuntimeAgentMessages,
  pullRuntimeIssues,
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
  recordAgentMessageResponse?: (
    input: DaemonFetchContextualAgentMessageInput
  ) => Promise<AgentMessageEventResponse>;
}

type DaemonFetchContextualIssueEventInput = Parameters<typeof recordAgentIssueEvent>[0];
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
    const host = await getAgentHost(state);

    for (const action of response.actions) {
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

    for (const claim of response.claims) {
      await runMessageClaim(claim);
    }
  }

  async function runIssueClaim(claim: RuntimeIssueClaimDTO) {
    try {
      const result = await runtime.runAgentPrompt(claim.agent.id, buildIssuePrompt(claim));

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
    } catch (error) {
      await sendIssueEvent({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        issueId: claim.issue.id,
        status: "todo",
        message: error instanceof Error ? error.message : "Agent issue execution failed."
      });
    }
  }

  async function runMessageClaim(claim: RuntimeAgentMessageClaimDTO) {
    try {
      const result = await runtime.runAgentPrompt(claim.agent.id, buildDirectMessagePrompt(claim));

      await sendAgentMessageResponse({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        content:
          result.responseText.trim() ||
          `Completed response in session ${result.sessionId} via ${result.implementationPackage}.`
      });
    } catch (error) {
      await sendAgentMessageResponse({
        controlPlaneUrl: config.controlPlaneUrl,
        fetcher: dependencies.fetcher,
        agentId: claim.agent.id,
        sourceMessageId: claim.sourceMessage.id,
        content: error instanceof Error ? error.message : "Agent message execution failed."
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
      `You are ${claim.agent.name}.`,
      "Reply naturally in this direct conversation with the user.",
      `User message: ${claim.sourceMessage.content}`
    ].join("\n\n");
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

import type { WorkspaceBootstrapPayload } from "@workpilot/shared";
import { getDefaultChannelId, type ShellState } from "./shell-state";

export type AgentLifecycleState = "running" | "stopped";
export type AgentRestartOption = "restart" | "reset_session" | "full_reset";

export function getAgentLifecycleState(agentId: string, lifecycleById: Record<string, AgentLifecycleState>) {
  return lifecycleById[agentId] ?? "running";
}

export function applyAgentLifecycleChange(
  lifecycleById: Record<string, AgentLifecycleState>,
  agentId: string,
  nextState: AgentLifecycleState
) {
  return {
    ...lifecycleById,
    [agentId]: nextState
  };
}

export function applyAgentRestartOption(input: {
  workspace: WorkspaceBootstrapPayload;
  lifecycleById: Record<string, AgentLifecycleState>;
  agentId: string;
  channelId: string;
  option: AgentRestartOption;
}) {
  if (input.option !== "full_reset") {
    return {
      workspace: input.workspace,
      lifecycleById: applyAgentLifecycleChange(input.lifecycleById, input.agentId, "running")
    };
  }

  return {
    workspace: {
      ...input.workspace,
      messages: input.workspace.messages.filter((message) => message.channelId !== input.channelId),
      issues: input.workspace.issues.filter((issue) => issue.sourceChannelId !== input.channelId)
    },
    lifecycleById: applyAgentLifecycleChange(input.lifecycleById, input.agentId, "running")
  };
}

export function applyAgentDelete(input: {
  workspace: WorkspaceBootstrapPayload;
  shellState: ShellState;
  agentId: string;
  lifecycleById: Record<string, AgentLifecycleState>;
}) {
  const nextWorkspace: WorkspaceBootstrapPayload = {
    ...input.workspace,
    agents: input.workspace.agents.filter((agent) => agent.id !== input.agentId)
  };
  const { [input.agentId]: _removedLifecycleState, ...nextLifecycleById } = input.lifecycleById;
  const nextShellState =
    input.shellState.activeTarget.kind === "agent" && input.shellState.activeTarget.id === input.agentId
      ? {
          ...input.shellState,
          activeTarget: {
            kind: "channel" as const,
            id: getDefaultChannelId(nextWorkspace.channels)
          }
        }
      : input.shellState;

  return {
    workspace: nextWorkspace,
    shellState: nextShellState,
    lifecycleById: nextLifecycleById
  };
}

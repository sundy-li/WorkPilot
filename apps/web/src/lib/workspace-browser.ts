export type AgentBrowserMode = "chat" | "issues" | "profile";

export interface AgentWorkspaceBrowserState {
  agentId: string | null;
  mode: AgentBrowserMode;
}

export interface RuntimeWorkspaceBrowserState {
  runtimeId: string | null;
}

export function createInitialAgentWorkspaceBrowserState(agentId: string | null): AgentWorkspaceBrowserState {
  return {
    agentId,
    mode: "chat"
  };
}

export function selectAgentWorkspaceTarget(agentId: string): AgentWorkspaceBrowserState {
  return {
    agentId,
    mode: "chat"
  };
}

export function setAgentWorkspaceMode(
  state: AgentWorkspaceBrowserState,
  mode: AgentBrowserMode
): AgentWorkspaceBrowserState {
  if (!state.agentId) {
    return state;
  }

  return {
    ...state,
    mode
  };
}

export function createInitialRuntimeWorkspaceBrowserState(runtimeId: string | null): RuntimeWorkspaceBrowserState {
  return {
    runtimeId
  };
}

export function selectRuntimeWorkspaceTarget(runtimeId: string): RuntimeWorkspaceBrowserState {
  return {
    runtimeId
  };
}

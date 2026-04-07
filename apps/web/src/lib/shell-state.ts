import type { AgentIdentity, ChannelSummary } from "@workpilot/shared";

export type PrimaryView = "chat" | "kanban" | "agents" | "runtimes" | "users" | "settings";
export type ConversationTargetKind = "channel" | "agent";

export interface ConversationTarget {
  kind: ConversationTargetKind;
  id: string;
}

export interface ShellState {
  workspaceId: string;
  primaryView: PrimaryView;
  activeTarget: ConversationTarget;
  detailOpen: boolean;
}

export function createInitialShellState(channels: ChannelSummary[], workspaceId = ""): ShellState {
  return {
    workspaceId,
    primaryView: "chat",
    activeTarget: {
      kind: "channel",
      id: getDefaultChannelId(channels)
    },
    detailOpen: false
  };
}

export function selectConversationTarget(state: ShellState, target: ConversationTarget): ShellState {
  return {
    ...state,
    primaryView: "chat",
    activeTarget: target,
    detailOpen: false
  };
}

export function selectPrimaryView(state: ShellState, primaryView: PrimaryView): ShellState {
  return {
    ...state,
    primaryView,
    detailOpen: false
  };
}

export function selectWorkspace(state: ShellState, workspaceId: string, channels: ChannelSummary[]): ShellState {
  return {
    workspaceId,
    primaryView: "chat",
    activeTarget: {
      kind: "channel",
      id: getDefaultChannelId(channels)
    },
    detailOpen: false
  };
}

export function reconcileInvalidActiveTarget(
  state: ShellState,
  channels: ChannelSummary[],
  agents: AgentIdentity[]
): ShellState {
  if (state.primaryView !== "chat") {
    return state;
  }

  const hasTarget =
    state.activeTarget.kind === "channel"
      ? channels.some((channel) => channel.id === state.activeTarget.id)
      : agents.some((agent) => agent.id === state.activeTarget.id);

  return hasTarget ? state : createInitialShellState(channels, state.workspaceId);
}

export function getDefaultChannelId(channels: ChannelSummary[]) {
  return channels.find((channel) => channel.id === "chn_general")?.id ?? channels[0]?.id ?? "";
}

export function getChannelDisplayName(channel: ChannelSummary) {
  if (channel.id === "chn_general") {
    return "all";
  }

  return channel.name;
}

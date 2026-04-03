import type { ChannelSummary } from "@workpilot/shared";

export type PrimaryView = "chat" | "kanban" | "agents" | "runtimes" | "settings";
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

export function createInitialShellState(channels: ChannelSummary[], workspaceId = "org_demo"): ShellState {
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

export function getDefaultChannelId(channels: ChannelSummary[]) {
  return channels.find((channel) => channel.id === "chn_general")?.id ?? channels[0]?.id ?? "";
}

export function getChannelDisplayName(channel: ChannelSummary) {
  if (channel.id === "chn_general") {
    return "all";
  }

  return channel.name;
}

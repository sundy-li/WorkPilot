import type { WorkspaceBootstrapPayload } from "@workpilot/shared";
import type { ShellState } from "./shell-state";

export function resolveConversationChannelId(
  target: ShellState["activeTarget"],
  workspace: WorkspaceBootstrapPayload | null
) {
  if (!workspace) {
    return "";
  }

  if (target.kind === "channel") {
    return target.id;
  }

  const agent = workspace.agents.find((entry) => entry.id === target.id);

  if (agent) {
    return agent.channelId;
  }

  const directChannels = workspace.channels.filter((channel) => channel.type === "direct");
  return directChannels[0]?.id ?? workspace.channels.find((channel) => channel.id === "chn_general")?.id ?? "";
}

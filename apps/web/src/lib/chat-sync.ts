import type { MessageDTO, WorkspaceBootstrapPayload } from "@workpilot/shared";

export function mergeChannelMessages(
  workspace: WorkspaceBootstrapPayload,
  channelId: string,
  channelMessages: MessageDTO[]
): WorkspaceBootstrapPayload {
  const otherMessages = workspace.messages.filter((message) => message.channelId !== channelId);
  const mergedMessages = new Map<string, MessageDTO>();

  for (const message of [...otherMessages, ...channelMessages]) {
    mergedMessages.set(message.id, message);
  }

  return {
    ...workspace,
    messages: [...mergedMessages.values()].sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt))
  };
}

export function shouldPollCurrentChat(input: {
  targetKind: "channel" | "agent";
  activeAgentStatus: "idle" | "running" | null;
  lastUserMessageAt: string | null;
  lastAgentMessageAt: string | null;
}) {
  if (input.targetKind !== "agent") {
    return true;
  }

  if (input.activeAgentStatus === "running") {
    return true;
  }

  if (!input.lastUserMessageAt) {
    return false;
  }

  if (!input.lastAgentMessageAt) {
    return true;
  }

  return Date.parse(input.lastUserMessageAt) > Date.parse(input.lastAgentMessageAt);
}

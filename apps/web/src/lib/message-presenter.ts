import type { AgentIdentity, MessageDTO } from "@workpilot/shared";

interface ResolveMessageSenderDisplayNameInput {
  message: Pick<MessageDTO, "senderId" | "senderType">;
  agents: AgentIdentity[];
  sessionUserId: string;
  accountName: string;
}

export function resolveMessageSenderDisplayName(input: ResolveMessageSenderDisplayNameInput) {
  const { accountName, agents, message, sessionUserId } = input;

  if (message.senderId === sessionUserId) {
    return accountName;
  }

  if (message.senderType === "agent") {
    return agents.find((agent) => agent.id === message.senderId)?.name ?? message.senderId;
  }

  return message.senderId;
}

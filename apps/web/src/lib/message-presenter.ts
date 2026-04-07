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

interface ContentPart {
  type: "text" | "mention";
  value: string;
  agentId?: string;
  userId?: string;
}

export function parseContentMentions(content: string, agents: AgentIdentity[]): ContentPart[] {
  const parts: ContentPart[] = [];
  const mentionRegex = /@(\w+)/g;
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(content)) !== null) {
    const mentionStart = match.index;

    // Try greedy multi-word match against agent names
    let bestAgent: AgentIdentity | undefined;
    let bestMatchLength = 0;
    const afterAt = content.slice(mentionStart + 1); // text after @

    for (const agent of agents) {
      const name = agent.name;
      if (afterAt.toLowerCase().startsWith(name.toLowerCase()) && name.length > bestMatchLength) {
        // Ensure the match ends at a word boundary (end of string, space, punctuation)
        const charAfter = afterAt[name.length];
        if (!charAfter || /[^a-zA-Z0-9_]/.test(charAfter)) {
          bestAgent = agent;
          bestMatchLength = name.length;
        }
      }
    }

    // Also check single-word ID matches
    const singleWord = match[1];
    if (!bestAgent) {
      bestAgent = agents.find((a) => a.id === `agt_${singleWord}` || a.id === singleWord);
      if (bestAgent) {
        bestMatchLength = singleWord.length;
      }
    }

    const matchLength = bestAgent ? bestMatchLength + 1 : match[0].length; // +1 for @
    const matchValue = content.slice(mentionStart, mentionStart + matchLength);

    if (mentionStart > lastIndex) {
      parts.push({ type: "text", value: content.slice(lastIndex, mentionStart) });
    }

    const isUserId = /^usr_/.test(singleWord);
    parts.push({
      type: "mention",
      value: matchValue,
      agentId: bestAgent?.id,
      userId: isUserId ? singleWord : undefined
    });

    lastIndex = mentionStart + matchLength;
    // Reset regex index to continue after our extended match
    mentionRegex.lastIndex = lastIndex;
  }

  if (lastIndex < content.length) {
    parts.push({ type: "text", value: content.slice(lastIndex) });
  }

  return parts;
}

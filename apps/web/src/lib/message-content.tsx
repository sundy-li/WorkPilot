import type { AgentIdentity } from "@workpilot/shared";
import { parseContentMentions } from "./message-presenter";

interface MessageContentProps {
  content: string;
  agents: AgentIdentity[];
  onAgentClick?: (agentId: string) => void;
  onUserClick?: (userId: string) => void;
}

export function MessageContent({ content, agents, onAgentClick, onUserClick }: MessageContentProps) {
  const parts = parseContentMentions(content, agents);

  return (
    <>
      {parts.map((part, idx) => {
        if (part.type === "mention" && part.agentId) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onAgentClick?.(part.agentId!)}
              className="font-semibold text-[var(--accent)] hover:underline"
            >
              {part.value}
            </button>
          );
        }

        if (part.type === "mention" && part.userId) {
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onUserClick?.(part.userId!)}
              className="font-semibold text-blue-600 hover:underline"
            >
              {part.value}
            </button>
          );
        }

        if (part.type === "mention") {
          return (
            <span key={idx} className="font-semibold text-neutral-500">
              {part.value}
            </span>
          );
        }

        return <span key={idx}>{part.value}</span>;
      })}
    </>
  );
}

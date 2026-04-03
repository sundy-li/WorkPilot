export function formatConversationTitle(input: { kind: "channel" | "agent"; name: string }) {
  return input.kind === "channel" ? `#${input.name}` : `@${input.name}`;
}

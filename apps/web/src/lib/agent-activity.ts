import type { AgentActivityDTO, AgentIdentity } from "@workpilot/shared";
import type { StatusTone } from "./theme";

interface GetAgentActivityBadgeInput {
  implementation: AgentIdentity["implementation"];
  activity: AgentActivityDTO | null;
}

export function getAgentActivityBadge(input: GetAgentActivityBadgeInput) {
  if (!input.activity) {
    return {
      tone: "neutral" as StatusTone,
      label: "idle",
      summary: `${capitalizeImplementation(input.implementation)} is connected and waiting for the next instruction.`,
      detail: null
    };
  }

  return {
    tone: input.activity.status === "running" ? ("warning" as StatusTone) : ("neutral" as StatusTone),
    label: input.activity.status,
    summary: input.activity.summary,
    detail: input.activity.detail
  };
}

function capitalizeImplementation(value: string) {
  if (value === "codex") {
    return "Codex";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

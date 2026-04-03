import {
  getAgentImplementationDefinition,
  listAgentImplementationDefinitions,
  type AgentImplementationDefinition,
  type AgentImplementation,
  type AgentReasoningEffort
} from "@workpilot/shared";
export { getAgentImplementationDefinition, listAgentImplementationDefinitions };

export interface AgentDraft {
  name: string;
  description: string;
  implementation: AgentImplementation;
  model: string;
  reasoningEffort: AgentReasoningEffort;
}

export function createInitialAgentDraft(): AgentDraft {
  return {
    name: "Release Analyst",
    description: "Track release quality, summarize regressions, and recommend rollout decisions.",
    implementation: "codex",
    model: getAgentImplementationDefinition("codex").defaultModel,
    reasoningEffort: getAgentImplementationDefinition("codex").defaultReasoningEffort
  };
}

export function createAgentDraftForImplementation(current: AgentDraft, implementation: AgentImplementation): AgentDraft {
  const definition = getAgentImplementationDefinition(implementation);

  return {
    ...current,
    implementation,
    model: definition.defaultModel,
    reasoningEffort: definition.defaultReasoningEffort
  };
}

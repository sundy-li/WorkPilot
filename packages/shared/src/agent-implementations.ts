import type { AgentImplementation, AgentReasoningEffort } from "./domain/workspace";

export interface AgentImplementationDefinition {
  id: AgentImplementation;
  label: string;
  packageName: string;
  defaultModel: string;
  models: string[];
  defaultReasoningEffort: AgentReasoningEffort;
  notes: string;
}

const AGENT_IMPLEMENTATION_DEFINITIONS: AgentImplementationDefinition[] = [
  {
    id: "codex",
    label: "Codex CLI",
    packageName: "@rivet-dev/agent-os-codex-agent",
    defaultModel: "gpt-5.4",
    models: ["gpt-5.4", "gpt-5", "gpt-4.1"],
    defaultReasoningEffort: "medium",
    notes: "Best fit for repository-centric coding work."
  },
  {
    id: "claude",
    label: "Claude",
    packageName: "@rivet-dev/agent-os-claude",
    defaultModel: "claude-sonnet-4.5",
    models: ["claude-sonnet-4.5", "claude-opus-4.1", "claude-haiku-3.5"],
    defaultReasoningEffort: "medium",
    notes: "Strong general-purpose planning and synthesis."
  },
  {
    id: "opencode",
    label: "OpenCode",
    packageName: "@rivet-dev/agent-os-opencode",
    defaultModel: "gpt-5",
    models: ["gpt-5", "claude-sonnet-4.5", "gemini-2.5-pro"],
    defaultReasoningEffort: "medium",
    notes: "Flexible OSS-oriented runtime wrapper."
  },
  {
    id: "pi",
    label: "Pi",
    packageName: "@rivet-dev/agent-os-pi",
    defaultModel: "claude-sonnet-4.5",
    models: ["claude-sonnet-4.5", "gpt-5", "claude-opus-4.1"],
    defaultReasoningEffort: "medium",
    notes: "Good default when you want a generic coding agent."
  }
];

export function listAgentImplementationDefinitions() {
  return AGENT_IMPLEMENTATION_DEFINITIONS;
}

export function getAgentImplementationDefinition(implementation: AgentImplementation) {
  const definition = AGENT_IMPLEMENTATION_DEFINITIONS.find((entry) => entry.id === implementation);

  if (!definition) {
    throw new Error(`Unknown agent implementation: ${implementation}`);
  }

  return definition;
}

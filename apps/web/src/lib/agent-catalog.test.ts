import { describe, expect, test } from "bun:test";
import { createAgentDraftForImplementation, getAgentImplementationDefinition } from "./agent-catalog";

describe("agent catalog", () => {
  test("describes codex as an agent-os registry implementation", () => {
    expect(getAgentImplementationDefinition("codex")).toMatchObject({
      id: "codex",
      packageName: "@rivet-dev/agent-os-codex-agent",
      defaultModel: "gpt-5.4"
    });
  });

  test("switches draft defaults when changing implementation", () => {
    expect(
      createAgentDraftForImplementation({
        name: "Release Analyst",
        description: "",
        implementation: "claude",
        model: "claude-sonnet-4.5",
        reasoningEffort: "medium"
      }, "pi")
    ).toMatchObject({
      implementation: "pi",
      model: "claude-sonnet-4.5",
      reasoningEffort: "medium"
    });
  });
});

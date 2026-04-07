import { describe, expect, test } from "bun:test";
import { createAgentDraftForImplementation, getAgentImplementationDefinition } from "./agent-catalog";

describe("agent catalog", () => {
  test("describes codex as an agent-os host agent implementation", () => {
    expect(getAgentImplementationDefinition("codex")).toMatchObject({
      id: "codex",
      packageName: "codex",
      defaultModel: "gpt-5.4"
    });
  });

  test("uses the canonical claude opus model id in the shared catalog", () => {
    expect(getAgentImplementationDefinition("claude")).toMatchObject({
      defaultModel: "default"
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

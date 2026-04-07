import { describe, expect, test } from "bun:test";
import { getAgentActivityBadge } from "./agent-activity";

describe("agent activity", () => {
  test("surfaces live codex activity details for the active chat header", () => {
    expect(
      getAgentActivityBadge({
        implementation: "codex",
        activity: {
          agentId: "agt_coder",
          status: "running",
          summary: "Codex CLI is applying repository changes.",
          detail: "Streaming tool output",
          updatedAt: "2025-04-03T22:19:08.000Z"
        }
      })
    ).toEqual({
      tone: "warning",
      label: "running",
      presenceLabel: "Typing...",
      summary: "Codex CLI is applying repository changes.",
      detail: "Streaming tool output"
    });
  });

  test("falls back to an idle badge when no activity is reported", () => {
    expect(
      getAgentActivityBadge({
        implementation: "claude",
        activity: null
      })
    ).toEqual({
      tone: "neutral",
      label: "idle",
      presenceLabel: "Idle",
      summary: "Claude is connected and waiting for the next instruction.",
      detail: null
    });
  });
});

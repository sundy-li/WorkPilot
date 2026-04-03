import { describe, expect, test } from "bun:test";
import { formatAgentSidebarMeta, getPublicImplementationSummary } from "./agent-presentation";

describe("agent presentation", () => {
  test("formats runtime and implementation into one compact line", () => {
    expect(formatAgentSidebarMeta("Seed Runtime", "Claude")).toBe("Seed Runtime · Claude");
  });

  test("keeps implementation details user-facing", () => {
    expect(
      getPublicImplementationSummary({
        label: "Codex CLI",
        notes: "Best fit for repository-centric coding work.",
        packageName: "@rivet-dev/agent-os-codex-agent"
      })
    ).toEqual({
      title: "Codex CLI",
      description: "Best fit for repository-centric coding work."
    });
  });
});

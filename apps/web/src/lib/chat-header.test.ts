import { describe, expect, test } from "bun:test";
import { formatConversationTitle } from "./chat-header";

describe("chat header", () => {
  test("formats a channel title with a single hash prefix", () => {
    expect(formatConversationTitle({ kind: "channel", name: "all" })).toBe("#all");
  });

  test("formats an agent title with an at prefix", () => {
    expect(formatConversationTitle({ kind: "agent", name: "Ops Bot" })).toBe("@Ops Bot");
  });
});

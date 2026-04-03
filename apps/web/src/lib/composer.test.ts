import { describe, expect, test } from "bun:test";
import { shouldSendMessageFromKeypress, shouldSubmitInlineDraftFromKeypress } from "./composer";

describe("composer shortcuts", () => {
  test("sends the message when enter is pressed without modifiers", () => {
    expect(shouldSendMessageFromKeypress({ isComposing: false, key: "Enter", shiftKey: false })).toBe(true);
  });

  test("does not send while ime composition is active", () => {
    expect(shouldSendMessageFromKeypress({ isComposing: true, key: "Enter", shiftKey: false })).toBe(false);
  });

  test("does not send when shift-enter is used for a newline", () => {
    expect(shouldSendMessageFromKeypress({ isComposing: false, key: "Enter", shiftKey: true })).toBe(false);
  });

  test("does not send for non-enter keys", () => {
    expect(shouldSendMessageFromKeypress({ isComposing: false, key: "a", shiftKey: false })).toBe(false);
  });

  test("submits an inline draft when enter is pressed", () => {
    expect(shouldSubmitInlineDraftFromKeypress({ isComposing: false, key: "Enter" })).toBe(true);
  });

  test("does not submit an inline draft during ime composition", () => {
    expect(shouldSubmitInlineDraftFromKeypress({ isComposing: true, key: "Enter" })).toBe(false);
  });
});

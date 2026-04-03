import { describe, expect, test } from "bun:test";
import { shouldAutoScrollToLatest } from "./chat-scroll";

describe("chat scroll", () => {
  test("auto-scrolls when a new message count is greater than the previous count", () => {
    expect(shouldAutoScrollToLatest({ nextCount: 4, previousCount: 3 })).toBe(true);
  });

  test("does not auto-scroll when the count stays the same", () => {
    expect(shouldAutoScrollToLatest({ nextCount: 4, previousCount: 4 })).toBe(false);
  });

  test("does not auto-scroll on an empty initial render", () => {
    expect(shouldAutoScrollToLatest({ nextCount: 0, previousCount: 0 })).toBe(false);
  });
});

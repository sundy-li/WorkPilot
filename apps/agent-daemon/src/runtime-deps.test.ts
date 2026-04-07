import { describe, expect, test } from "bun:test";

describe("agent daemon runtime dependencies", () => {
  test("loads zod for ACP-based agent adapters", async () => {
    await expect(import("zod")).resolves.toBeDefined();
  });
});

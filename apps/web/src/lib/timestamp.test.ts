import { describe, expect, test } from "bun:test";
import { createTimestampLabels } from "./timestamp";

describe("timestamp labels", () => {
  test("keeps the compact label for chat rows and exposes a second-precision tooltip", () => {
    expect(
      createTimestampLabels("2025-04-03T22:19:08.000Z", {
        locale: "en-US",
        timeZone: "UTC"
      })
    ).toEqual({
      compact: "Apr 3, 10:19 PM",
      precise: "Apr 3, 2025, 10:19:08 PM UTC"
    });
  });
});

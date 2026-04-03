import { describe, expect, test } from "bun:test";
import { syncExpandedRuntimeIds } from "./runtime-tree";

describe("runtime tree", () => {
  test("preserves known expansion state and auto-expands the focused runtime", () => {
    expect(
      syncExpandedRuntimeIds(
        {
          rtm_seed: false,
          rtm_old: true
        },
        ["rtm_seed", "rtm_datacenter"],
        "rtm_datacenter"
      )
    ).toEqual({
      rtm_seed: false,
      rtm_datacenter: true
    });
  });
});

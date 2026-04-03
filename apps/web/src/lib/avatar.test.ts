import { describe, expect, test } from "bun:test";
import { getAvatarInitials, getAvatarPalette } from "./avatar";

describe("avatar helpers", () => {
  test("builds initials from a display name", () => {
    expect(getAvatarInitials("admin")).toBe("A");
    expect(getAvatarInitials("sundy li")).toBe("SL");
  });

  test("returns a deterministic color palette from a seed", () => {
    expect(getAvatarPalette("admin@workpilot.local")).toEqual(getAvatarPalette("admin@workpilot.local"));
  });
});

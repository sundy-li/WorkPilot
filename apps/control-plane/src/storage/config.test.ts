import { describe, expect, test } from "bun:test";
import { getConfiguredDatabaseUrl } from "./config";

describe("storage config", () => {
  test("uses postgres only when DATABASE_URL is present", () => {
    expect(getConfiguredDatabaseUrl({ DATABASE_URL: "postgres://demo" })).toBe("postgres://demo");
    expect(getConfiguredDatabaseUrl({})).toBeNull();
    expect(getConfiguredDatabaseUrl({ PGHOST: "127.0.0.1" })).toBeNull();
  });
});

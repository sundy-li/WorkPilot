import { describe, expect, test } from "bun:test";
import { parseDaemonConfig } from "./config";

describe("daemon config", () => {
  test("defaults the runtime name to the host name", () => {
    const config = parseDaemonConfig(
      ["--control-plane-url", "http://localhost:3001", "--registration-token", "wpt_demo"],
      {},
      "macbook-pro"
    );

    expect(config?.nodeName).toBe("macbook-pro");
  });

  test("parses daemon lifecycle defaults", () => {
    const config = parseDaemonConfig(
      ["--control-plane-url", "http://localhost:3001", "--registration-token", "wpt_demo"],
      {},
      "macbook-pro"
    );

    expect(config?.heartbeatIntervalMs).toBe(30_000);
    expect(config?.statePath.endsWith("/.workpilot/agent-daemon/state.json")).toBe(true);
    expect(config?.workspaceRoot.endsWith("/.workpilot/agent-daemon/workspace")).toBe(true);
  });
});

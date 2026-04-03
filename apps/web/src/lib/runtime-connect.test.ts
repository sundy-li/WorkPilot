import { describe, expect, test } from "bun:test";
import type { RuntimeIdentity } from "@workpilot/shared";
import {
  buildRuntimeInstallCommand,
  createRuntimeConnectPanel,
  findNewlyConnectedRuntime,
  getRuntimeConnectStatusText
} from "./runtime-connect";

describe("runtime connect", () => {
  test("builds an npx install command by default", () => {
    expect(
      buildRuntimeInstallCommand({
        mode: "npx",
        controlPlaneUrl: "http://localhost:3001",
        token: "wpt_demo"
      })
    ).toContain("npx @workpilot/agent-daemon@latest");
  });

  test("builds a bunx install command", () => {
    expect(
      buildRuntimeInstallCommand({
        mode: "bunx",
        controlPlaneUrl: "http://localhost:3001",
        token: "wpt_demo"
      })
    ).toContain("bunx @workpilot/agent-daemon@latest");
  });

  test("builds a source checkout install command", () => {
    expect(
      buildRuntimeInstallCommand({
        mode: "source",
        controlPlaneUrl: "http://localhost:3001",
        token: "wpt_demo"
      })
    ).toContain("bun run --cwd apps/agent-daemon start --");
  });

  test("detects a newly connected runtime from polling results", () => {
    const runtimes: RuntimeIdentity[] = [
      {
        id: "rtm_seed",
        name: "Seed Runtime",
        status: "online"
      },
      {
        id: "rtm_host",
        name: "macbook-pro",
        status: "pending"
      }
    ];

    expect(findNewlyConnectedRuntime(["rtm_seed"], runtimes)?.id).toBe("rtm_host");
  });

  test("creates a connect runtime panel model from a registration command", () => {
    expect(
      createRuntimeConnectPanel({
        token: "wpt_demo",
        expiresAt: "2025-01-01T00:15:00.000Z",
        controlPlaneUrl: "http://localhost:3001",
        baselineRuntimeIds: ["rtm_seed"]
      })
    ).toEqual({
      isOpen: true,
      token: "wpt_demo",
      expiresAt: "2025-01-01T00:15:00.000Z",
      controlPlaneUrl: "http://localhost:3001",
      mode: "source",
      baselineRuntimeIds: ["rtm_seed"],
      connectedRuntimeId: null,
      copied: false
    });
  });

  test("formats connected runtime auto-close status text", () => {
    expect(getRuntimeConnectStatusText("m1max.local", 5)).toBe("m1max.local connected. (closing window in 5s)");
  });
});

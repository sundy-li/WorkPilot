import type { RuntimeIdentity } from "@workpilot/shared";

export function buildRuntimeInstallCommand(input: {
  mode: "npx" | "bunx" | "source";
  controlPlaneUrl: string;
  token: string;
}) {
  if (input.mode === "npx") {
    return [
      "npx @workpilot/agent-daemon@latest --",
      `--control-plane-url ${input.controlPlaneUrl}`,
      `--registration-token ${input.token}`
    ].join(" ");
  }

  if (input.mode === "bunx") {
    return [
      "bunx @workpilot/agent-daemon@latest --",
      `--control-plane-url ${input.controlPlaneUrl}`,
      `--registration-token ${input.token}`
    ].join(" ");
  }

  return [
    "bun run --cwd apps/agent-daemon start --",
    `--control-plane-url ${input.controlPlaneUrl}`,
    `--registration-token ${input.token}`
  ].join(" ");
}

export function findNewlyConnectedRuntime(baselineRuntimeIds: string[], runtimes: RuntimeIdentity[]) {
  const baseline = new Set(baselineRuntimeIds);
  return runtimes.find((runtime) => !baseline.has(runtime.id)) ?? null;
}

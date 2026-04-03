import type { RuntimeIdentity } from "@workpilot/shared";

export interface RuntimeConnectPanelModel {
  isOpen: boolean;
  token: string;
  expiresAt: string;
  controlPlaneUrl: string;
  mode: "npx" | "bunx" | "source";
  baselineRuntimeIds: string[];
  connectedRuntimeId: string | null;
  copied: boolean;
}

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

export function createRuntimeConnectPanel(input: {
  token: string;
  expiresAt: string;
  controlPlaneUrl: string;
  baselineRuntimeIds: string[];
}): RuntimeConnectPanelModel {
  return {
    isOpen: true,
    token: input.token,
    expiresAt: input.expiresAt,
    controlPlaneUrl: input.controlPlaneUrl,
    mode: "source",
    baselineRuntimeIds: input.baselineRuntimeIds,
    connectedRuntimeId: null,
    copied: false
  };
}

export function getRuntimeConnectStatusText(runtimeName: string, remainingSeconds: number | null) {
  if (remainingSeconds && remainingSeconds > 0) {
    return `${runtimeName} connected. (closing window in ${remainingSeconds}s)`;
  }

  return `${runtimeName} connected.`;
}

import { homedir, hostname } from "node:os";
import { join } from "node:path";

export interface DaemonCliConfig {
  controlPlaneUrl: string;
  registrationToken: string;
  nodeName: string;
  agentKey: string;
  heartbeatIntervalMs: number;
  statePath: string;
  workspaceRoot: string;
}

export function parseDaemonConfig(
  argv: string[],
  env: NodeJS.ProcessEnv,
  hostName = hostname()
): DaemonCliConfig | null {
  const args = new Map<string, string>();

  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    const value = argv[index + 1];

    if (key?.startsWith("--") && value) {
      args.set(key.slice(2), value);
      index += 1;
    }
  }

  const controlPlaneUrl = args.get("control-plane-url") ?? env.CONTROL_PLANE_URL;
  const registrationToken = args.get("registration-token") ?? env.REGISTRATION_TOKEN;

  if (!controlPlaneUrl || !registrationToken) {
    return null;
  }

  return {
    controlPlaneUrl,
    registrationToken,
    nodeName: args.get("node-name") ?? env.NODE_NAME ?? hostName,
    agentKey: args.get("agent-key") ?? env.AGENT_KEY ?? crypto.randomUUID(),
    heartbeatIntervalMs: parseInteger(
      args.get("heartbeat-interval-ms") ?? env.HEARTBEAT_INTERVAL_MS,
      30_000
    ),
    statePath:
      args.get("state-path") ??
      env.DAEMON_STATE_PATH ??
      join(homedir(), ".workpilot", "agent-daemon", "state.json"),
    workspaceRoot:
      args.get("workspace-root") ??
      env.DAEMON_WORKSPACE_ROOT ??
      join(homedir(), ".workpilot", "agent-daemon", "workspace")
  };
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

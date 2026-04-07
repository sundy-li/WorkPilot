import { homedir, hostname } from "node:os";
import { join } from "node:path";

export interface DaemonCliConfig {
  controlPlaneUrl: string;
  registrationToken: string;
  nodeName: string;
  agentKey: string;
  heartbeatIntervalMs: number;
  messagePollIntervalMs: number;
  statePath: string;
  workspaceRoot: string;
  agentWorkspaceRoot: string;
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
    agentKey: args.get("agent-key") ?? env.AGENT_KEY ?? buildDefaultAgentKey(hostName),
    heartbeatIntervalMs: parseInteger(
      args.get("heartbeat-interval-ms") ?? env.HEARTBEAT_INTERVAL_MS,
      30_000
    ),
    messagePollIntervalMs: parseInteger(
      args.get("message-poll-interval-ms") ?? env.MESSAGE_POLL_INTERVAL_MS,
      1_000
    ),
    statePath:
      args.get("state-path") ??
      env.DAEMON_STATE_PATH ??
      join(homedir(), ".workpilot", "agent-daemon", "state.json"),
    workspaceRoot:
      args.get("workspace-root") ??
      env.DAEMON_WORKSPACE_ROOT ??
      join(homedir(), ".workpilot", "agent-daemon", "workspace"),
    agentWorkspaceRoot:
      args.get("agent-workspace-root") ??
      env.DAEMON_AGENT_WORKSPACE_ROOT ??
      join(homedir(), ".workpilot", "agents")
  };
}

function parseInteger(value: string | undefined, fallback: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) ? parsed : fallback;
}

function buildDefaultAgentKey(hostName: string) {
  const normalized = hostName.trim().toLowerCase().replace(/[^a-z0-9.-]+/g, "_");
  return `host_${normalized || "unknown"}`;
}

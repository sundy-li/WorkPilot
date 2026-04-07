import type { RuntimeIdentity } from "@workpilot/shared";

interface GetRuntimePresenceDetailOptions {
  now?: string;
  offlineThresholdMs?: number;
}

export function getRuntimePresenceDetail(
  runtime: RuntimeIdentity,
  options: GetRuntimePresenceDetailOptions = {}
) {
  if (runtime.status === "pending") {
    return "Awaiting first heartbeat";
  }

  if (!runtime.lastHeartbeatAt) {
    return null;
  }

  const now = Date.parse(options.now ?? new Date().toISOString());
  const lastHeartbeatAt = Date.parse(runtime.lastHeartbeatAt);

  if (Number.isNaN(now) || Number.isNaN(lastHeartbeatAt)) {
    return null;
  }

  if (runtime.status === "online") {
    return `Last heartbeat ${formatDuration(Math.max(now - lastHeartbeatAt, 0))} ago`;
  }

  if (runtime.status === "offline") {
    const offlineThresholdMs = options.offlineThresholdMs ?? 60_000;
    return `Offline for ${formatDuration(Math.max(now - lastHeartbeatAt - offlineThresholdMs, 0))}`;
  }

  return `Last seen ${formatDuration(Math.max(now - lastHeartbeatAt, 0))} ago`;
}

function formatDuration(durationMs: number) {
  const totalSeconds = Math.max(Math.floor(durationMs / 1000), 0);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  }

  if (minutes < 60) {
    return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h ${remainingMinutes}m`;
}

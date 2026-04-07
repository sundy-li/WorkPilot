export function syncExpandedRuntimeIds(
  current: Record<string, boolean>,
  runtimeIds: string[],
  focusedRuntimeId: string | null
) {
  const next: Record<string, boolean> = {};

  for (const runtimeId of runtimeIds) {
    next[runtimeId] = current[runtimeId] ?? runtimeId === focusedRuntimeId;
  }

  return next;
}

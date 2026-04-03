export function getConfiguredDatabaseUrl(env: Record<string, string | undefined>): string | null {
  return env.DATABASE_URL ?? null;
}

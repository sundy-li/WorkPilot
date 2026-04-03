import { SQL } from "bun";
import { assertSafeIdentifier, readSchemaSql } from "./schema";

interface SyncPostgresDatabaseOptions {
  databaseUrl: string;
  schema?: string;
}

export async function syncPostgresDatabase(options: SyncPostgresDatabaseOptions) {
  const schema = options.schema ?? "public";
  assertSafeIdentifier(schema);

  const pool = new SQL(options.databaseUrl);
  await pool.connect();

  try {
    if (schema !== "public") {
      await pool.unsafe(`create schema if not exists "${schema}"`);
    }

    const sql = await pool.reserve();

    try {
      await sql.unsafe(`set search_path to "${schema}"`);
      await sql.unsafe(await readSchemaSql());
    } finally {
      sql.release();
    }
  } finally {
    await pool.close({ timeout: 0 });
  }
}

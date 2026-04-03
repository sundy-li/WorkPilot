import { SQL } from "bun";
import { assertSafeIdentifier, readSchemaSql } from "./schema";

interface ResetPostgresDatabaseOptions {
  databaseUrl: string;
  schema?: string;
}

export async function resetPostgresDatabase(options: ResetPostgresDatabaseOptions) {
  const schema = options.schema ?? "public";
  assertSafeIdentifier(schema);

  const pool = new SQL(options.databaseUrl);
  await pool.connect();

  try {
    await pool.unsafe(`drop schema if exists "${schema}" cascade`);
    await pool.unsafe(`create schema "${schema}"`);

    if (schema === "public") {
      await pool.unsafe(`grant all on schema "public" to public`);
      await pool.unsafe(`grant all on schema "public" to current_user`);
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

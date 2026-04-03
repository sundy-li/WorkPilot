import { expect, test } from "bun:test";
import { SQL } from "bun";
import { createPostgresControlPlaneStorage } from "./postgres";
import { syncPostgresDatabase } from "./sync";

test("syncPostgresDatabase is idempotent and preserves existing data", async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy";
  const schema = createTestSchemaName();
  const storage = await createPostgresControlPlaneStorage({
    databaseUrl,
    schema
  });

  try {
    await storage.initialize();
    await storage.seedDemoWorkspace();

    const beforeSync = await storage.getWorkspaceBootstrap("org_demo");
    expect(beforeSync.organization?.id).toBe("org_demo");
    expect(beforeSync.channels.length).toBeGreaterThan(0);

    await syncPostgresDatabase({
      databaseUrl,
      schema
    });
    await syncPostgresDatabase({
      databaseUrl,
      schema
    });

    const afterSync = await storage.getWorkspaceBootstrap("org_demo");
    expect(afterSync.organization?.id).toBe("org_demo");
    expect(afterSync.channels.length).toBe(beforeSync.channels.length);
  } finally {
    await storage.dispose();
  }
});

test("syncPostgresDatabase adds the used_runtime_key column for existing runtime_registration_tokens tables", async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy";
  const schema = createTestSchemaName();
  const pool = new SQL(databaseUrl);
  await pool.connect();

  try {
    await pool.unsafe(`create schema "${schema}"`);
    const sql = await pool.reserve();

    try {
      await sql.unsafe(`set search_path to "${schema}"`);
      await sql.unsafe(`
        create table runtime_registration_tokens (
          id text primary key,
          organization_id text not null,
          token text unique not null,
          created_by text not null,
          expires_at timestamptz not null,
          used_at timestamptz
        )
      `);
    } finally {
      sql.release();
    }

    await syncPostgresDatabase({
      databaseUrl,
      schema
    });

    const verify = await pool.reserve();

    try {
      const rows = await verify<Array<{ column_name: string }>>`
        select column_name
        from information_schema.columns
        where table_schema = ${schema}
          and table_name = 'runtime_registration_tokens'
          and column_name = 'used_runtime_key'
      `;

      expect(rows).toHaveLength(1);
    } finally {
      verify.release();
    }
  } finally {
    await pool.unsafe(`drop schema if exists "${schema}" cascade`);
    await pool.close({ timeout: 0 });
  }
});

function createTestSchemaName() {
  return `workpilot_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

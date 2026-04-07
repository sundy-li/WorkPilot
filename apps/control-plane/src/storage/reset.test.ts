import { expect, test } from "bun:test";
import { TEST_ORG_ID } from "@workpilot/shared";
import { createPostgresControlPlaneStorage } from "./postgres";
import { resetPostgresDatabase } from "./reset";

test("resetPostgresDatabase recreates tables and removes existing data", async () => {
  const databaseUrl = process.env.DATABASE_URL ?? "postgres://sundy:sundy@127.0.0.1:5432/sundy";
  const schema = createTestSchemaName();
  const storage = await createPostgresControlPlaneStorage({
    databaseUrl,
    schema
  });

  try {
    await storage.initialize();
    await storage.seedDemoWorkspace();

    const beforeReset = await storage.getWorkspaceBootstrap(TEST_ORG_ID);
    expect(beforeReset.organization?.id).toBe(TEST_ORG_ID);
    expect(beforeReset.channels.length).toBeGreaterThan(0);

    await resetPostgresDatabase({
      databaseUrl,
      schema
    });

    const afterReset = await storage.getWorkspaceBootstrap(TEST_ORG_ID);
    expect(afterReset.organization).toBeNull();
    expect(afterReset.channels).toEqual([]);
    expect(afterReset.runtimes).toEqual([]);
    expect(afterReset.agents).toEqual([]);
    expect(afterReset.messages).toEqual([]);
    expect(afterReset.issues).toEqual([]);
  } finally {
    await storage.dispose();
  }
});

function createTestSchemaName() {
  return `workpilot_test_${crypto.randomUUID().replace(/-/g, "").slice(0, 12)}`;
}

import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { getConfiguredDatabaseUrl } from "./storage/config";
import { resetPostgresDatabase } from "./storage/reset";

const currentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(currentDir, "../../../.env") });
loadEnv({ path: resolve(currentDir, "../.env"), override: false });

const databaseUrl = getConfiguredDatabaseUrl(process.env);

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required to reset the database.");
}

const schema = process.env.DATABASE_SCHEMA ?? "public";

await resetPostgresDatabase({
  databaseUrl,
  schema
});

console.log(`Database schema "${schema}" has been reset.`);

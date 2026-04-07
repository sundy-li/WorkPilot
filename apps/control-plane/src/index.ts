import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createControlPlaneApp } from "./app";
import { createPostgresControlPlaneStorage, getRequiredDatabaseUrl } from "./storage/postgres";

const currentDir = dirname(fileURLToPath(import.meta.url));
loadEnv({ path: resolve(currentDir, "../../../.env") });
loadEnv({ path: resolve(currentDir, "../.env"), override: false });

const port = Number(process.env.PORT ?? 3001);
const storage = await createPostgresControlPlaneStorage({
  databaseUrl: getRequiredDatabaseUrl(process.env)
});

await storage.initialize();

const app = createControlPlaneApp({
  controlPlaneUrl: process.env.CONTROL_PLANE_URL,
  storage
});

export default {
  port,
  fetch: app.fetch,
  idleTimeout: 60
};

console.log(`WorkPilot control-plane listening on http://localhost:${port}`);

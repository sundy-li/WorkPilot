import { parseDaemonConfig } from "./config";
import { createDaemonRuntime } from "./runtime";

const config = parseDaemonConfig(process.argv.slice(2), process.env);

if (!config) {
  console.log("WorkPilot agent-daemon is ready. Provide registration arguments to connect a node.");
} else {
  const runtime = createDaemonRuntime(config);

  await runtime.start();

  const stop = async () => {
    await runtime.stop();
    process.exit(0);
  };

  process.once("SIGINT", () => {
    void stop();
  });
  process.once("SIGTERM", () => {
    void stop();
  });

  console.log(`Runtime ${config.nodeName} connected to ${config.controlPlaneUrl}.`);
}

import { config as loadDotEnv } from "dotenv";
import { resolve } from "node:path";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

loadDotEnv({ path: resolve(process.cwd(), "../.env") });

async function start() {
  const config = loadConfig();
  const app = buildApp(config);

  try {
    await app.listen({ host: "0.0.0.0", port: config.PORT });
  } catch (error) {
    app.log.error({ err: error }, "API startup failed");
    process.exitCode = 1;
  }
}

void start();
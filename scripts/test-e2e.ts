import { spawnSync } from "node:child_process";

const url = new URL(process.env.DATABASE_URL!);
url.searchParams.set("schema", "tracker_test");
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  APP_ORIGIN: "http://127.0.0.1:3100",
  DEMO_AUTH_ENABLED: "true",
  TRACKER_E2E: "true",
};
for (const args of [
  ["node_modules/prisma/build/index.js", "migrate", "deploy"],
  ["--env-file=.env", "prisma/seed.ts"],
  ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)],
]) {
  const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

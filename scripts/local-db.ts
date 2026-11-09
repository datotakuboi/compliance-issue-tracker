import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const database = new EmbeddedPostgres({
  databaseDir: ".postgres",
  user: "tracker",
  password: "tracker",
  port: 54329,
  persistent: true,
  authMethod: "scram-sha-256",
  postgresFlags: ["-h", "127.0.0.1"],
});

if (!existsSync(".postgres/PG_VERSION")) await database.initialise();
await database.start();
const client = database.getPgClient();
await client.connect();
const result = await client.query(
  "SELECT 1 FROM pg_database WHERE datname = 'tracker'",
);
await client.end();
if (result.rowCount === 0) await database.createDatabase("tracker");
console.log("PostgreSQL ready on 127.0.0.1:54329. Keep this terminal running.");

let stopping = false;
async function stop() {
  if (stopping) return;
  stopping = true;
  await database.stop();
  process.exit(0);
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

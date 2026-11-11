import { readFileSync } from "node:fs";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { apiClient, createMcpServer } from "./server.ts";

try {
  const token =
    process.env.MCP_SERVICE_TOKEN || readFileSync(".mcp-token", "utf8").trim();
  const server = createMcpServer(
    apiClient(process.env.MCP_API_URL ?? "http://127.0.0.1:3000", token),
  );
  await server.connect(new StdioServerTransport());
} catch {
  process.stderr.write(
    "MCP startup failed. Start the API and run npm run token:create, or configure MCP_SERVICE_TOKEN securely.\n",
  );
  process.exitCode = 1;
}

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { strict as assert } from "node:assert";

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ["--env-file=.env", "src/mcp/index.ts"],
  stderr: "inherit",
});
const client = new Client({ name: "compliwise-demo", version: "0.1.0" });
async function call(name: string, args: Record<string, unknown>) {
  const response = await client.callTool({ name, arguments: args });
  assert(!response.isError, JSON.stringify(response.content));
  return (response.structuredContent as { data: Record<string, unknown> }).data;
}
try {
  await client.connect(transport);
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [
    "add_evidence_reference",
    "analyze_issue",
    "execute_approved_plan",
    "get_issue",
    "get_issue_audit",
    "list_issues",
  ]);
  const execute = process.argv.indexOf("--execute");
  const analyze = process.argv.indexOf("--analyze");
  if (execute !== -1) {
    const runId = process.argv[execute + 1];
    assert(runId, "Provide a run ID after --execute.");
    console.log(await call("execute_approved_plan", { runId }));
  } else if (analyze !== -1) {
    const issueId = process.argv[analyze + 1] ?? "CW-101";
    let issue = await call("get_issue", { issueId });
    const evidence = process.argv.indexOf("--evidence");
    if (evidence !== -1) {
      const url = process.argv[evidence + 1];
      assert(url, "Provide the actual review evidence URL after --evidence.");
      await call("add_evidence_reference", {
        issueId,
        version: issue.version,
        url,
        description:
          "Remediation review evidence submitted for independent human assessment.",
      });
      issue = await call("get_issue", { issueId });
    }
    const run = await call("analyze_issue", {
      issueId,
      version: issue.version,
    });
    console.log(JSON.stringify(run, null, 2));
    console.log(
      "Review this proposal in the app as Jordan Lee. After approval: npm run test:mcp -- --execute RUN_ID",
    );
  } else {
    const list = await call("list_issues", { pageSize: 5 });
    const first = (list.items as { id: string }[])[0];
    if (first) {
      await call("get_issue", { issueId: first.id });
      await call("get_issue_audit", { issueId: first.id });
    }
    console.log(
      `MCP smoke test passed: ${tools.length} tools; list, detail, and audit retrieved through stdio and the authenticated HTTP API.`,
    );
  }
} finally {
  await client.close();
}

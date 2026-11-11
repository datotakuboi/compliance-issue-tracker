import { afterEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { apiClient, createMcpServer } from "../src/mcp/server.ts";

afterEach(() => vi.restoreAllMocks());

describe("MCP tool boundary", () => {
  it("exposes exactly six tools, validates inputs, and has no approval capability", async () => {
    const request = vi.fn().mockResolvedValue({ id: "CW-101", version: 1 });
    const server = createMcpServer(request);
    const client = new Client({ name: "test", version: "1" });
    const [clientTransport, serverTransport] =
      InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
    try {
      const { tools } = await client.listTools();
      expect(tools.map((tool) => tool.name).sort()).toEqual([
        "add_evidence_reference",
        "analyze_issue",
        "execute_approved_plan",
        "get_issue",
        "get_issue_audit",
        "list_issues",
      ]);
      const invalid = await client.callTool({
        name: "get_issue",
        arguments: { issueId: "../../auth/session" },
      });
      expect(invalid.isError).toBe(true);
      expect(request).not.toHaveBeenCalled();
      const valid = await client.callTool({
        name: "get_issue",
        arguments: { issueId: "CW-101" },
      });
      expect(valid.isError).not.toBe(true);
      expect(request).toHaveBeenCalledWith("issues/CW-101");
      request.mockRejectedValueOnce(
        new Error("APPROVAL_REQUIRED: Independent human approval is required."),
      );
      const blocked = await client.callTool({
        name: "execute_approved_plan",
        arguments: { runId: "plan-1" },
      });
      expect(blocked.isError).toBe(true);
    } finally {
      await client.close();
      await server.close();
    }
  });
  it("limits insecure transports to loopback and never follows token-bearing redirects", async () => {
    const token = "x".repeat(43);
    expect(() => apiClient("http://external.example", token)).toThrow();
    expect(() => apiClient("https://user:pass@example.com", token)).toThrow();
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ items: [] }));
    await apiClient("http://127.0.0.1:3000", token)("issues");
    expect(fetch.mock.calls[0][1]?.redirect).toBe("error");
  });
});

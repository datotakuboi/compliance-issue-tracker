import { afterEach, describe, expect, it, vi } from "vitest";
import {
  authenticate,
  authorize,
  hashToken,
  type Actor,
} from "../src/server/auth.ts";
import {
  dateSchema,
  evidenceSchema,
  updateSchema,
} from "../src/server/validation.ts";

const human = (role: Actor["role"]): Actor => ({
  id: "user",
  name: "Test",
  kind: "human",
  role,
  scopes: [],
});

afterEach(() => vi.unstubAllEnvs());

describe("authorization boundary", () => {
  it("rejects existing demo cookies in production before any database lookup", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("DEMO_AUTH_ENABLED", "true");
    await expect(
      authenticate(
        new Request("http://127.0.0.1:3000/api/issues", {
          headers: { Cookie: `cw_session=${"x".repeat(43)}` },
        }),
      ),
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });
  });
  it("lets viewers read but denies every mutation", () => {
    expect(() => authorize(human("VIEWER"), "issues:read")).not.toThrow();
    for (const permission of [
      "issues:write",
      "playbook:analyze",
      "playbook:execute",
      "approve",
    ] as const) {
      expect(() => authorize(human("VIEWER"), permission)).toThrow();
    }
  });
  it("never permits service approval, even with a forged scope", () => {
    const service: Actor = {
      ...human("SERVICE"),
      kind: "service",
      scopes: ["approve", "issues:read"],
    };
    expect(() => authorize(service, "approve")).toThrow();
    expect(() => authorize(service, "issues:write")).toThrow();
    expect(() => authorize(service, "issues:read")).not.toThrow();
  });
  it("limits approval to human approvers", () => {
    expect(() => authorize(human("ANALYST"), "approve")).toThrow();
    expect(() => authorize(human("APPROVER"), "approve")).not.toThrow();
    expect(() => authorize(human("SERVICE"), "issues:read")).toThrow();
  });
  it("separates analyst mutations from approver decisions", () => {
    for (const permission of [
      "issues:write",
      "playbook:analyze",
      "playbook:execute",
    ] as const) {
      expect(() => authorize(human("ANALYST"), permission)).not.toThrow();
      expect(() => authorize(human("APPROVER"), permission)).toThrow();
    }
    expect(() => authorize(human("APPROVER"), "issues:read")).not.toThrow();
  });
  it("hashes credentials instead of storing bearer secrets", () => {
    expect(hashToken("secret")).toHaveLength(64);
    expect(hashToken("secret")).not.toContain("secret");
  });
});

describe("untrusted inputs", () => {
  it("rejects unsafe evidence schemes and embedded credentials", () => {
    for (const url of [
      "javascript:alert(1)",
      "file:///etc/passwd",
      "https://user:pass@example.com",
    ]) {
      expect(
        evidenceSchema.safeParse({
          version: 1,
          url,
          description: "Review evidence",
        }).success,
      ).toBe(false);
    }
  });
  it("rejects impossible dates and direct completion", () => {
    expect(dateSchema.safeParse("2026-02-30").success).toBe(false);
    expect(dateSchema.safeParse("2028-02-29").success).toBe(true);
    expect(updateSchema.shape.status.safeParse("COMPLETED").success).toBe(
      false,
    );
  });
});

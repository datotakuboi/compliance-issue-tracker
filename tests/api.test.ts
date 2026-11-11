import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomBytes, randomUUID } from "node:crypto";
import { GET, POST } from "../src/app/api/[...path]/route.ts";
import { db } from "../src/server/db.ts";
import { hashToken } from "../src/server/auth.ts";

const prefix = `api-${randomUUID()}`;
const viewerToken = randomBytes(32).toString("base64url");
const analystToken = randomBytes(32).toString("base64url");
const approverToken = randomBytes(32).toString("base64url");
const serviceToken = randomBytes(32).toString("base64url");
const expiredToken = randomBytes(32).toString("base64url");
const origin = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
function context(path: string) {
  return { params: Promise.resolve({ path: path.split("/") }) };
}

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "HTTP authorization and errors",
  () => {
    beforeAll(async () => {
      expect(
        new URL(process.env.DATABASE_URL!).searchParams.get("schema"),
      ).toBe("tracker_test");
      await db.user.create({
        data: {
          id: `${prefix}-viewer`,
          name: "API Viewer",
          role: "VIEWER",
          sessions: {
            create: {
              tokenHash: hashToken(viewerToken),
              expiresAt: new Date(Date.now() + 60000),
            },
          },
        },
      });
      for (const [role, token] of [
        ["ANALYST", analystToken],
        ["APPROVER", approverToken],
      ] as const) {
        await db.user.create({
          data: {
            id: `${prefix}-${role.toLowerCase()}`,
            name: `API ${role}`,
            role,
            sessions: {
              create: {
                tokenHash: hashToken(token),
                expiresAt: new Date(Date.now() + 60000),
              },
            },
          },
        });
      }
      await db.user.create({
        data: {
          id: `${prefix}-service`,
          name: "API Service",
          role: "SERVICE",
          tokens: {
            create: [
              {
                tokenHash: hashToken(serviceToken),
                scopes: ["issues:read"],
                expiresAt: new Date(Date.now() + 60000),
              },
              {
                tokenHash: hashToken(expiredToken),
                scopes: ["issues:read"],
                expiresAt: new Date(0),
              },
            ],
          },
        },
      });
    });
    afterAll(async () => {
      await db.session.deleteMany({
        where: { userId: { startsWith: prefix } },
      });
      await db.serviceToken.deleteMany({
        where: { userId: { startsWith: prefix } },
      });
      await db.user.deleteMany({ where: { id: { startsWith: prefix } } });
      await db.$disconnect();
    });
    it("rejects unauthenticated access", async () => {
      const result = await GET(
        new Request(`${origin}/api/issues`),
        context("issues"),
      );
      expect(result.status).toBe(401);
      expect(result.headers.get("Cache-Control")).toBe("no-store");
    });
    it("accepts a read-only service token but denies mutation", async () => {
      const headers = {
        Authorization: `Bearer ${serviceToken}`,
        "Content-Type": "application/json",
      };
      expect(
        (
          await GET(
            new Request(`${origin}/api/issues`, { headers }),
            context("issues"),
          )
        ).status,
      ).toBe(200);
      expect(
        (
          await POST(
            new Request(`${origin}/api/issues`, {
              method: "POST",
              headers,
              body: JSON.stringify({
                title: "Cannot create this",
                description: "Read-only credential cannot mutate",
                severity: "LOW",
                ownerId: null,
                dueDate: "2030-01-01",
              }),
            }),
            context("issues"),
          )
        ).status,
      ).toBe(403);
    });
    it("rejects expired bearer tokens", async () => {
      const result = await GET(
        new Request(`${origin}/api/issues`, {
          headers: { Authorization: `Bearer ${expiredToken}` },
        }),
        context("issues"),
      );
      expect(result.status).toBe(401);
    });
    it("rejects browser mutations from another origin", async () => {
      const result = await POST(
        new Request(`${origin}/api/issues`, {
          method: "POST",
          headers: {
            Cookie: `cw_session=${viewerToken}`,
            Origin: "https://untrusted.example",
            "Content-Type": "application/json",
          },
          body: "{}",
        }),
        context("issues"),
      );
      expect(result.status).toBe(403);
      expect((await result.json()).error.code).toBe("INVALID_ORIGIN");
    });
    it("returns structured filter validation errors", async () => {
      const result = await GET(
        new Request(`${origin}/api/issues?pageSize=99999`, {
          headers: { Cookie: `cw_session=${viewerToken}` },
        }),
        context("issues"),
      );
      expect(result.status).toBe(400);
      expect((await result.json()).error.code).toBe("VALIDATION_ERROR");
    });
    it("exposes authenticated report aggregates and global audit pagination", async () => {
      const headers = { Cookie: `cw_session=${viewerToken}` };
      const reports = await GET(
        new Request(`${origin}/api/reports`, { headers }),
        context("reports"),
      );
      expect(reports.status).toBe(200);
      const reportBody = await reports.json();
      expect(reportBody.total).toEqual(expect.any(Number));
      expect(reportBody.severity).toBeDefined();
      expect(reportBody.status).toBeDefined();
      const audit = await GET(
        new Request(`${origin}/api/audit?page=1&pageSize=5`, { headers }),
        context("audit"),
      );
      expect(audit.status).toBe(200);
      const auditBody = await audit.json();
      expect(auditBody.items).toBeInstanceOf(Array);
      expect(auditBody.total).toEqual(expect.any(Number));
      expect(auditBody.pageSize).toBe(5);
    });
    it("restricts the approvals queue endpoint to approvers", async () => {
      const viewer = await GET(
        new Request(`${origin}/api/approvals`, {
          headers: { Cookie: `cw_session=${viewerToken}` },
        }),
        context("approvals"),
      );
      expect(viewer.status).toBe(403);
      const analyst = await GET(
        new Request(`${origin}/api/approvals`, {
          headers: { Cookie: `cw_session=${analystToken}` },
        }),
        context("approvals"),
      );
      expect(analyst.status).toBe(403);
      const approver = await GET(
        new Request(`${origin}/api/approvals`, {
          headers: { Cookie: `cw_session=${approverToken}` },
        }),
        context("approvals"),
      );
      expect(approver.status).toBe(200);
      const body = await approver.json();
      expect(body.items.every((issue: { status: string }) => issue.status === "PENDING_REVIEW")).toBe(true);
    });
  },
);

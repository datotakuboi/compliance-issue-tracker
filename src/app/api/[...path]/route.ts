import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z, ZodError } from "zod";
import {
  authenticate,
  authorize,
  checkOrigin,
  createSession,
  hashToken,
  sessionCookie,
} from "../../../server/auth.ts";
import { db } from "../../../server/db.ts";
import { AppError, assert } from "../../../server/errors.ts";
import {
  addEvidence,
  analyzeIssue,
  createIssue,
  dashboard,
  executePlan,
  getAudit,
  getIssue,
  listIssues,
  reviewPlan,
  updateIssue,
} from "../../../server/services.ts";
import { idSchema, versionSchema } from "../../../server/validation.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };

async function jsonBody(request: Request) {
  assert(
    request.headers.get("content-type")?.split(";")[0] === "application/json",
    415,
    "JSON_REQUIRED",
    "Send application/json.",
  );
  const reader = request.body?.getReader();
  assert(reader, 400, "BODY_REQUIRED", "A JSON body is required.");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      assert(
        bytes <= 32768,
        413,
        "BODY_TOO_LARGE",
        "The request body exceeds 32 KB.",
      );
      chunks.push(value);
    }
  } finally {
    await reader.cancel();
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new AppError(
      400,
      "INVALID_JSON",
      "The request body must be valid JSON.",
    );
  }
}

const loginAttempts = new Map<string, { count: number; reset: number }>();
function limitDemoLogin() {
  const key = "local-demo";
  const now = Date.now();
  const previous = loginAttempts.get(key);
  const entry =
    previous && previous.reset > now
      ? previous
      : { count: 0, reset: now + 60000 };
  entry.count++;
  loginAttempts.set(key, entry);
  assert(
    entry.count <= 30,
    429,
    "RATE_LIMITED",
    "Too many demo logins. Try again in a minute.",
  );
}

async function handler(request: Request, context: Context) {
  const correlationId = randomUUID();
  const headers = {
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "X-Request-Id": correlationId,
  };
  const respond = (
    data: unknown,
    status = 200,
    extra?: Record<string, string>,
  ) => Response.json(data, { status, headers: { ...headers, ...extra } });
  try {
    const { path } = await context.params;
    const route = path.join("/");
    const method = request.method;
    if (route === "auth/demo-users" && method === "GET") {
      assert(
        process.env.DEMO_AUTH_ENABLED === "true" &&
          process.env.NODE_ENV !== "production",
        403,
        "DEMO_DISABLED",
        "Simulated login is disabled.",
      );
      return respond(
        await db.user.findMany({
          where: {
            id: { in: ["demo-viewer", "demo-analyst", "demo-approver"] },
            role: { not: "SERVICE" },
          },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        }),
      );
    }
    if (route === "auth/session" && method === "POST") {
      checkOrigin(request);
      limitDemoLogin();
      const input = z
        .object({
          userId: z.enum(["demo-viewer", "demo-analyst", "demo-approver"]),
        })
        .strict()
        .parse(await jsonBody(request));
      const token = await createSession(input.userId);
      const secure =
        new URL(process.env.APP_ORIGIN ?? "http://127.0.0.1:3000").protocol ===
        "https:"
          ? "; Secure"
          : "";
      return respond({ signedIn: true }, 200, {
        "Set-Cookie": `${sessionCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`,
      });
    }
    const actor = await authenticate(request);
    if (!["GET", "HEAD"].includes(method) && actor.kind === "human")
      checkOrigin(request);
    if (route === "auth/session" && method === "GET")
      return respond({
        id: actor.id,
        name: actor.name,
        role: actor.role,
        kind: actor.kind,
      });
    if (route === "auth/session" && method === "DELETE") {
      assert(
        actor.kind === "human",
        403,
        "FORBIDDEN",
        "Service credentials cannot manage browser sessions.",
      );
      const cookie = request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${sessionCookie}=`))
        ?.slice(sessionCookie.length + 1);
      if (cookie)
        await db.session.deleteMany({
          where: { tokenHash: hashToken(cookie), userId: actor.id },
        });
      return respond({ signedOut: true }, 200, {
        "Set-Cookie": `${sessionCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`,
      });
    }
    if (route === "users" && method === "GET") {
      authorize(actor, "issues:read");
      return respond(
        await db.user.findMany({
          where: { role: { not: "SERVICE" } },
          select: { id: true, name: true, role: true },
          orderBy: { name: "asc" },
        }),
      );
    }
    if (route === "dashboard" && method === "GET")
      return respond(await dashboard(actor));
    if (route === "issues" && method === "GET")
      return respond(
        await listIssues(
          actor,
          Object.fromEntries(new URL(request.url).searchParams),
        ),
      );
    if (route === "issues" && method === "POST")
      return respond(
        await createIssue(actor, await jsonBody(request), correlationId),
        201,
      );
    if (path[0] === "issues" && path[1]) {
      const id = idSchema.parse(path[1]);
      if (path.length === 2 && method === "GET")
        return respond(await getIssue(actor, id));
      if (path.length === 2 && method === "PATCH")
        return respond(
          await updateIssue(actor, id, await jsonBody(request), correlationId),
        );
      if (path.length === 3 && path[2] === "evidence" && method === "POST")
        return respond(
          await addEvidence(actor, id, await jsonBody(request), correlationId),
          201,
        );
      if (path.length === 3 && path[2] === "analyze" && method === "POST") {
        const { version } = z
          .object({ version: versionSchema })
          .strict()
          .parse(await jsonBody(request));
        return respond(
          await analyzeIssue(actor, id, version, correlationId),
          201,
        );
      }
      if (path.length === 3 && path[2] === "audit" && method === "GET") {
        const cursor = new URL(request.url).searchParams.get("cursor");
        return respond(
          await getAudit(
            actor,
            id,
            cursor ? idSchema.parse(cursor) : undefined,
          ),
        );
      }
    }
    if (
      path[0] === "plans" &&
      path[1] &&
      path.length === 3 &&
      method === "POST"
    ) {
      const runId = idSchema.parse(path[1]);
      if (path[2] === "review")
        return respond(
          await reviewPlan(
            actor,
            runId,
            await jsonBody(request),
            correlationId,
          ),
        );
      if (path[2] === "execute")
        return respond(await executePlan(actor, runId, correlationId));
    }
    throw new AppError(404, "NOT_FOUND", "API endpoint not found.");
  } catch (error) {
    if (error instanceof ZodError)
      return respond(
        {
          error: {
            code: "VALIDATION_ERROR",
            message: "Check the submitted fields.",
            fields: error.issues.map((issue) => ({
              path: issue.path.join("."),
              message: issue.message,
            })),
            correlationId,
          },
        },
        400,
      );
    if (error instanceof AppError)
      return respond(
        { error: { code: error.code, message: error.message, correlationId } },
        error.status,
      );
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      ["P2034", "P2002"].includes(error.code)
    )
      return respond(
        {
          error: {
            code: "CONFLICT",
            message: "A concurrent change occurred. Refresh and retry.",
            correlationId,
          },
        },
        409,
      );
    console.error("API operation failed", {
      correlationId,
      type: error instanceof Error ? error.name : "unknown",
    });
    return respond(
      {
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed. Try again later.",
          correlationId,
        },
      },
      500,
    );
  }
}

export { handler as GET, handler as POST, handler as PATCH, handler as DELETE };

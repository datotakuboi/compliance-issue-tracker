import { createHash, randomBytes } from "node:crypto";
import type { Role } from "@prisma/client";
import { db } from "./db.ts";
import { assert } from "./errors.ts";

export const scopes = [
  "issues:read",
  "issues:write",
  "playbook:analyze",
  "playbook:execute",
] as const;
export type Scope = (typeof scopes)[number];
export type Actor = {
  id: string;
  name: string;
  role: Role;
  kind: "human" | "service";
  scopes: string[];
};
export const sessionCookie = "cw_session";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function authorize(actor: Actor, permission: Scope | "approve") {
  if (actor.kind === "service") {
    assert(
      actor.role === "SERVICE" &&
        permission !== "approve" &&
        actor.scopes.includes(permission),
      403,
      "FORBIDDEN",
      "This service credential does not permit that action.",
    );
    return;
  }
  assert(
    actor.role !== "SERVICE",
    403,
    "FORBIDDEN",
    "A service identity cannot use a human session.",
  );
  if (permission === "issues:read") return;
  if (permission === "approve") {
    assert(
      actor.role === "APPROVER",
      403,
      "FORBIDDEN",
      "An independent approver is required.",
    );
    return;
  }
  assert(
    actor.role === "ANALYST",
    403,
    "FORBIDDEN",
    "Only analysts can manage issues or execute remediation.",
  );
}

export async function authenticate(request: Request): Promise<Actor> {
  const authorization = request.headers.get("authorization");
  if (authorization) {
    assert(
      /^Bearer [\w-]{40,200}$/.test(authorization),
      401,
      "UNAUTHENTICATED",
      "Invalid service credential.",
    );
    const token = await db.serviceToken.findUnique({
      where: { tokenHash: hashToken(authorization.slice(7)) },
      include: { user: true },
    });
    assert(
      token &&
        !token.revokedAt &&
        token.expiresAt > new Date() &&
        token.user.role === "SERVICE",
      401,
      "UNAUTHENTICATED",
      "Invalid or expired service credential.",
    );
    return { ...token.user, kind: "service", scopes: token.scopes };
  }
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${sessionCookie}=`))
    ?.slice(sessionCookie.length + 1);
  assert(cookie, 401, "UNAUTHENTICATED", "Sign in to continue.");
  assert(
    process.env.DEMO_AUTH_ENABLED === "true" &&
      process.env.NODE_ENV !== "production",
    401,
    "UNAUTHENTICATED",
    "Simulated browser sessions are disabled in this environment.",
  );
  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(cookie) },
    include: { user: true },
  });
  assert(
    session &&
      session.expiresAt > new Date() &&
      session.user.role !== "SERVICE",
    401,
    "UNAUTHENTICATED",
    "Your session has expired. Sign in again.",
  );
  return { ...session.user, kind: "human", scopes: [] };
}

export function checkOrigin(request: Request) {
  const expected = process.env.APP_ORIGIN ?? "http://127.0.0.1:3000";
  assert(
    request.headers.get("origin") === new URL(expected).origin,
    403,
    "INVALID_ORIGIN",
    "Request origin is not allowed.",
  );
}

export async function createSession(userId: string) {
  assert(
    process.env.DEMO_AUTH_ENABLED === "true" &&
      process.env.NODE_ENV !== "production",
    403,
    "DEMO_DISABLED",
    "Simulated login is disabled outside development.",
  );
  const user = await db.user.findUnique({ where: { id: userId } });
  assert(
    user && user.role !== "SERVICE",
    400,
    "INVALID_USER",
    "Select a demo user.",
  );
  const token = randomBytes(32).toString("base64url");
  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt: new Date(Date.now() + 8 * 60 * 60 * 1000),
    },
  });
  return token;
}

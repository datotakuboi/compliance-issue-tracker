import { randomBytes } from "node:crypto";
import { writeFileSync } from "node:fs";
import { db } from "../src/server/db.ts";
import { hashToken, scopes } from "../src/server/auth.ts";

try {
  const revokeIndex = process.argv.indexOf("--revoke");
  if (revokeIndex !== -1) {
    const id = process.argv[revokeIndex + 1];
    if (!id) throw new Error("Provide a token ID after --revoke.");
    const result = await db.serviceToken.updateMany({
      where: { id },
      data: { revokedAt: new Date() },
    });
    console.log(`Revoked ${result.count} credential(s).`);
  } else {
    const token = randomBytes(32).toString("base64url");
    const record = await db.serviceToken.create({
      data: {
        tokenHash: hashToken(token),
        userId: "remediation-agent",
        scopes: process.argv.includes("--read-only")
          ? ["issues:read"]
          : [...scopes],
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });
    try {
      writeFileSync(".mcp-token", `${token}\n`, { mode: 0o600 });
    } catch (error) {
      await db.serviceToken.update({
        where: { id: record.id },
        data: { revokedAt: new Date() },
      });
      throw error;
    }
    console.log(
      `Credential ${record.id} created; expires ${record.expiresAt.toISOString()}.`,
    );
    console.log(
      "Secret stored in ignored .mcp-token, not printed. Restrict its file permissions on shared machines.",
    );
  }
} finally {
  await db.$disconnect();
}

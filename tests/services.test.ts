import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db } from "../src/server/db.ts";
import type { Actor } from "../src/server/auth.ts";
import {
  addEvidence,
  analyzeIssue,
  createIssue,
  dashboard,
  executePlan,
  getAudit,
  getIssue,
  reviewPlan,
  updateIssue,
} from "../src/server/services.ts";

const prefix = `test-${randomUUID()}`;
const actor = (role: Actor["role"], suffix = role): Actor => ({
  id: `${prefix}-${suffix}`,
  name: suffix,
  role,
  kind: role === "SERVICE" ? "service" : "human",
  scopes: [
    "issues:read",
    "issues:write",
    "playbook:analyze",
    "playbook:execute",
  ],
});
const analyst = actor("ANALYST");
const approver = actor("APPROVER");
const viewer = actor("VIEWER");
const service = actor("SERVICE");
const input = {
  title: "Quarterly access review",
  description: "Review privileged accounts and document revocation outcomes.",
  severity: "HIGH",
  ownerId: analyst.id,
  dueDate: "2020-01-01",
};
const issueIds: string[] = [];

async function makeIssue() {
  const issue = await createIssue(analyst, input);
  issueIds.push(issue.id);
  return issue;
}

async function ready() {
  const issue = await makeIssue();
  await addEvidence(analyst, issue.id, {
    version: issue.version,
    url: "https://example.com/review",
    description: "Signed access review record",
  });
  return {
    issue,
    run: await analyzeIssue(service, issue.id, issue.version + 1),
  };
}

describe.skipIf(process.env.RUN_DB_TESTS !== "true")(
  "PostgreSQL application services",
  () => {
    beforeAll(async () => {
      expect(
        new URL(process.env.DATABASE_URL!).searchParams.get("schema"),
      ).toBe("tracker_test");
      for (const user of [analyst, approver, viewer, service])
        await db.user.create({
          data: { id: user.id, name: user.name, role: user.role },
        });
    });

    afterAll(async () => {
      await db.$transaction(async (transaction) => {
        await transaction.approval.deleteMany({
          where: { run: { issueId: { in: issueIds } } },
        });
        await transaction.playbookRun.deleteMany({
          where: { issueId: { in: issueIds } },
        });
        await transaction.evidence.deleteMany({
          where: { issueId: { in: issueIds } },
        });
        await transaction.auditEvent.deleteMany({
          where: { issueId: { in: issueIds } },
        });
        await transaction.issue.deleteMany({ where: { id: { in: issueIds } } });
        await transaction.user.deleteMany({
          where: { id: { startsWith: prefix } },
        });
      });
      await db.$disconnect();
    });

    it("rejects read-only mutations without creating an issue or audit", async () => {
      await expect(createIssue(viewer, input)).rejects.toMatchObject({
        status: 403,
      });
    });

    it("returns priority issues independently of register pagination", async () => {
      const issue = await makeIssue();
      const summary = await dashboard(viewer);
      expect(summary.attention.map((item) => item.id)).toContain(issue.id);
      expect(summary.attention.length).toBeLessThanOrEqual(5);
    });

    it("persists issue mutations and audits together, and rejects stale edits", async () => {
      const issue = await makeIssue();
      await updateIssue(analyst, issue.id, {
        ...input,
        version: 1,
        status: "IN_PROGRESS",
      });
      await expect(
        updateIssue(analyst, issue.id, {
          ...input,
          version: 1,
          status: "OPEN",
        }),
      ).rejects.toMatchObject({ code: "STALE_VERSION" });
      const history = await getAudit(viewer, issue.id);
      expect(history.items.map((event) => event.action)).toEqual(
        expect.arrayContaining(["ISSUE_CREATED", "ISSUE_UPDATED"]),
      );
      expect(history.items).toHaveLength(2);
    });

    it("blocks missing evidence and execution without approval", async () => {
      const issue = await makeIssue();
      const run = await analyzeIssue(service, issue.id, 1);
      expect(run.state).toBe("BLOCKED");
      await expect(executePlan(service, run.id)).rejects.toMatchObject({
        code: "APPROVAL_REQUIRED",
      });
      expect((await getIssue(viewer, issue.id)).status).toBe("OPEN");
    });

    it("denies both service approval and human self-approval", async () => {
      const { issue, run } = await ready();
      await expect(
        reviewPlan(service, run.id, {
          approved: true,
          note: "Trying to grant approval",
        }),
      ).rejects.toMatchObject({ status: 403 });
      const ownRun = await analyzeIssue(
        analyst,
        issue.id,
        run.analyzedVersion,
      );
      await db.playbookRun.update({
        where: { id: ownRun.id },
        data: { requesterId: approver.id },
      });
      await expect(
        reviewPlan(approver, ownRun.id, {
          approved: true,
          note: "Trying to approve my proposal",
        }),
      ).rejects.toMatchObject({ code: "SELF_APPROVAL" });
    });

    it("keeps approvers from changing issues or executing remediation", async () => {
      const issue = await makeIssue();
      await expect(
        updateIssue(approver, issue.id, {
          ...input,
          version: issue.version,
          status: "IN_PROGRESS",
        }),
      ).rejects.toMatchObject({ status: 403 });
      await expect(analyzeIssue(approver, issue.id, issue.version)).rejects.toMatchObject({ status: 403 });
      const { run } = await ready();
      await expect(executePlan(approver, run.id)).rejects.toMatchObject({ status: 403 });
    });

    it("invalidates an approved plan when evidence changes", async () => {
      const { issue, run } = await ready();
      await reviewPlan(approver, run.id, {
        approved: true,
        note: "Reviewed the evidence and approve closure",
      });
      await addEvidence(analyst, issue.id, {
        version: run.analyzedVersion,
        url: "https://example.com/new",
        description: "Additional review evidence",
      });
      await expect(executePlan(service, run.id)).rejects.toMatchObject({
        code: "STALE_VERSION",
      });
      expect((await getIssue(viewer, issue.id)).status).toBe("PENDING_REVIEW");
    });

    it("executes concurrently exactly once and excludes completed issues from overdue counts", async () => {
      const { issue, run } = await ready();
      await reviewPlan(approver, run.id, {
        approved: true,
        note: "Independent review completed; authorize closure",
      });
      const before = await dashboard(viewer);
      const results = await Promise.all([
        executePlan(service, run.id),
        executePlan(service, run.id),
      ]);
      expect(results.filter((result) => !result.alreadyExecuted)).toHaveLength(
        1,
      );
      const after = await dashboard(viewer);
      expect(after.completed).toBe(before.completed + 1);
      expect(after.overdue).toBe(before.overdue - 1);
      expect(after.open).toBe(before.open - 1);
      expect(
        (await getAudit(viewer, issue.id)).items.filter(
          (event) => event.action === "PLAN_EXECUTED",
        ),
      ).toHaveLength(1);
      await expect(
        addEvidence(analyst, issue.id, {
          version: run.analyzedVersion + 1,
          url: "https://example.com/new",
          description: "Cannot modify closed issues",
        }),
      ).rejects.toMatchObject({ code: "COMPLETED_IMMUTABLE" });
    });

    it("cannot execute a rejected proposal", async () => {
      const { run } = await ready();
      await reviewPlan(approver, run.id, {
        approved: false,
        note: "Evidence does not sufficiently demonstrate remediation",
      });
      await expect(executePlan(service, run.id)).rejects.toMatchObject({
        code: "APPROVAL_REQUIRED",
      });
    });
  },
);

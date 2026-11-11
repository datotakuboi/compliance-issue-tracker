import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { db } from "./db.ts";
import { authorize, type Actor } from "./auth.ts";
import { assert } from "./errors.ts";
import {
  auditFilterSchema,
  decisionSchema,
  evidenceSchema,
  filterSchema,
  issueSchema,
  updateSchema,
  versionSchema,
} from "./validation.ts";

const person = { select: { id: true, name: true, role: true } } as const;
type Transaction = Prisma.TransactionClient;

async function atomic<Result>(
  operation: (transaction: Transaction) => Promise<Result>,
): Promise<Result> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(operation, {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034" &&
        attempt < 2
      )
        continue;
      throw error;
    }
  }
}

export function todayUtc() {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

async function issueOrFail(transaction: Transaction, id: string) {
  const issue = await transaction.issue.findUnique({
    where: { id },
    include: { _count: { select: { evidence: true } } },
  });
  assert(issue, 404, "NOT_FOUND", "Issue not found.");
  return issue;
}

async function validateOwner(transaction: Transaction, ownerId: string | null) {
  if (!ownerId) return;
  const owner = await transaction.user.findUnique({ where: { id: ownerId } });
  assert(
    owner && ["ANALYST", "APPROVER"].includes(owner.role),
    400,
    "INVALID_OWNER",
    "Choose an analyst or approver as the issue owner.",
  );
}

async function audit(
  transaction: Transaction,
  actor: Actor,
  issueId: string,
  action: string,
  details: Prisma.InputJsonObject,
  correlationId: string,
) {
  await transaction.auditEvent.create({
    data: { actorId: actor.id, issueId, action, details, correlationId },
  });
}

function unchanged(actual: number, expected: number) {
  assert(
    actual === expected,
    409,
    "STALE_VERSION",
    "This issue changed. Refresh it and analyze again before continuing.",
  );
}

export async function listIssues(
  actor: Actor,
  input: unknown,
  options: { approvalQueue?: boolean } = {},
) {
  authorize(actor, "issues:read");
  if (options.approvalQueue) authorize(actor, "approve");
  const filters = filterSchema.parse(input);
  const where: Prisma.IssueWhereInput = {
    status: options.approvalQueue ? "PENDING_REVIEW" : filters.status,
    severity: filters.severity,
    ownerId: filters.ownerId,
    ...(options.approvalQueue
      ? {
          runs: {
            some: {
              state: "PROPOSED",
              requesterId: { not: actor.id },
            },
          },
        }
      : {}),
    ...(filters.query
      ? {
          OR: [
            { title: { contains: filters.query, mode: "insensitive" } },
            { description: { contains: filters.query, mode: "insensitive" } },
          ],
        }
      : {}),
    ...(filters.overdue === "true"
      ? {
          AND: [
            { status: { not: "COMPLETED" } },
            { dueDate: { lt: todayUtc() } },
          ],
        }
      : {}),
  };
  return db.$transaction(
    async (transaction) => {
      const [items, total] = await Promise.all([
        transaction.issue.findMany({
          where,
          include: { owner: person, _count: { select: { evidence: true } } },
          orderBy: [{ dueDate: "asc" }, { id: "asc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        transaction.issue.count({ where }),
      ]);
      return { items, total, page: filters.page, pageSize: filters.pageSize };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function getIssue(actor: Actor, id: string) {
  authorize(actor, "issues:read");
  const issue = await db.issue.findUnique({
    where: { id },
    include: {
      owner: person,
      evidence: {
        include: { submitter: person },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
      runs: {
        include: {
          requester: person,
          approval: { include: { reviewer: person } },
        },
        orderBy: { createdAt: "desc" },
        take: 20,
      },
    },
  });
  assert(issue, 404, "NOT_FOUND", "Issue not found.");
  return issue;
}

export async function dashboard(actor: Actor) {
  authorize(actor, "issues:read");
  return db.$transaction(
    async (transaction) => {
      const actionable = {
        OR: [
          {
            status: { not: "COMPLETED" as const },
            dueDate: { lt: todayUtc() },
          },
          { status: "PENDING_REVIEW" as const },
        ],
      };
      const [open, overdue, completed, pendingReview, total, attention] =
        await Promise.all([
          transaction.issue.count({ where: { status: { not: "COMPLETED" } } }),
          transaction.issue.count({
            where: {
              status: { not: "COMPLETED" },
              dueDate: { lt: todayUtc() },
            },
          }),
          transaction.issue.count({ where: { status: "COMPLETED" } }),
          transaction.issue.count({ where: { status: "PENDING_REVIEW" } }),
          transaction.issue.count(),
          transaction.issue.findMany({
            where: actionable,
            include: { owner: person },
            orderBy: [{ dueDate: "asc" }, { severity: "desc" }, { id: "asc" }],
            take: 5,
          }),
        ]);
      return { open, overdue, completed, pendingReview, total, attention };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function listAuditEvents(actor: Actor, input: unknown) {
  authorize(actor, "issues:read");
  const filters = auditFilterSchema.parse(input);
  const where: Prisma.AuditEventWhereInput = {
    issueId: filters.issueId,
    actorId: filters.actorId,
    action: filters.action,
    ...(filters.query
      ? {
          OR: [
            { action: { contains: filters.query, mode: "insensitive" } },
            { issueId: { contains: filters.query, mode: "insensitive" } },
            {
              actor: { name: { contains: filters.query, mode: "insensitive" } },
            },
            {
              issue: {
                title: { contains: filters.query, mode: "insensitive" },
              },
            },
          ],
        }
      : {}),
  };
  return db.$transaction(
    async (transaction) => {
      const [items, total] = await Promise.all([
        transaction.auditEvent.findMany({
          where,
          include: {
            actor: person,
            issue: {
              select: { id: true, title: true, severity: true, status: true },
            },
          },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          skip: (filters.page - 1) * filters.pageSize,
          take: filters.pageSize,
        }),
        transaction.auditEvent.count({ where }),
      ]);
      return {
        items,
        total,
        page: filters.page,
        pageSize: filters.pageSize,
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function reportSummary(actor: Actor) {
  authorize(actor, "issues:read");
  return db.$transaction(
    async (transaction) => {
      const [total, overdue, dueSoon, severity, status, latestAudit] =
        await Promise.all([
          transaction.issue.count(),
          transaction.issue.count({
            where: {
              status: { not: "COMPLETED" },
              dueDate: { lt: todayUtc() },
            },
          }),
          transaction.issue.count({
            where: {
              status: { not: "COMPLETED" },
              dueDate: {
                gte: todayUtc(),
                lt: new Date(todayUtc().valueOf() + 30 * 24 * 60 * 60 * 1000),
              },
            },
          }),
          transaction.issue.groupBy({
            by: ["severity"],
            _count: { _all: true },
          }),
          transaction.issue.groupBy({ by: ["status"], _count: { _all: true } }),
          transaction.auditEvent.count(),
        ]);
      return {
        generatedAt: new Date(),
        total,
        overdue,
        dueSoon,
        auditEvents: latestAudit,
        severity: Object.fromEntries(
          severity.map((entry) => [entry.severity, entry._count._all]),
        ),
        status: Object.fromEntries(
          status.map((entry) => [entry.status, entry._count._all]),
        ),
      };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}

export async function createIssue(
  actor: Actor,
  input: unknown,
  correlationId = randomUUID(),
) {
  authorize(actor, "issues:write");
  const data = issueSchema.parse(input);
  return atomic(async (transaction) => {
    await validateOwner(transaction, data.ownerId);
    const issue = await transaction.issue.create({
      data: { ...data, dueDate: new Date(`${data.dueDate}T00:00:00Z`) },
    });
    await audit(
      transaction,
      actor,
      issue.id,
      "ISSUE_CREATED",
      {
        title: issue.title,
        severity: issue.severity,
        ownerId: issue.ownerId,
        dueDate: data.dueDate,
        status: issue.status,
      },
      correlationId,
    );
    return issue;
  });
}

export async function updateIssue(
  actor: Actor,
  id: string,
  input: unknown,
  correlationId = randomUUID(),
) {
  authorize(actor, "issues:write");
  const { version, ...data } = updateSchema.parse(input);
  return atomic(async (transaction) => {
    const before = await issueOrFail(transaction, id);
    unchanged(before.version, version);
    assert(
      before.status !== "COMPLETED",
      409,
      "COMPLETED_IMMUTABLE",
      "Completed issues are read-only.",
    );
    await validateOwner(transaction, data.ownerId);
    if (data.status === "PENDING_REVIEW")
      assert(
        data.ownerId && before._count.evidence > 0,
        409,
        "NOT_READY",
        "Assign an owner and attach evidence before requesting review.",
      );
    const result = await transaction.issue.updateMany({
      where: { id, version },
      data: {
        ...data,
        dueDate: new Date(`${data.dueDate}T00:00:00Z`),
        version: { increment: 1 },
      },
    });
    assert(
      result.count === 1,
      409,
      "STALE_VERSION",
      "The issue changed. Refresh before editing.",
    );
    await audit(
      transaction,
      actor,
      id,
      "ISSUE_UPDATED",
      {
        before: {
          title: before.title,
          description: before.description,
          severity: before.severity,
          status: before.status,
          ownerId: before.ownerId,
          dueDate: before.dueDate.toISOString().slice(0, 10),
          version,
        },
        after: { ...data, version: version + 1 },
      },
      correlationId,
    );
    return transaction.issue.findUniqueOrThrow({ where: { id } });
  });
}

export async function addEvidence(
  actor: Actor,
  id: string,
  input: unknown,
  correlationId = randomUUID(),
) {
  authorize(actor, "issues:write");
  const { version, ...data } = evidenceSchema.parse(input);
  return atomic(async (transaction) => {
    const issue = await issueOrFail(transaction, id);
    unchanged(issue.version, version);
    assert(
      issue.status !== "COMPLETED",
      409,
      "COMPLETED_IMMUTABLE",
      "Completed issues are read-only.",
    );
    const result = await transaction.issue.updateMany({
      where: { id, version },
      data: { version: { increment: 1 } },
    });
    assert(
      result.count === 1,
      409,
      "STALE_VERSION",
      "The issue changed. Refresh before adding evidence.",
    );
    const evidence = await transaction.evidence.create({
      data: { ...data, issueId: id, submitterId: actor.id },
    });
    await audit(
      transaction,
      actor,
      id,
      "EVIDENCE_ADDED",
      {
        evidenceId: evidence.id,
        ...data,
        beforeVersion: version,
        afterVersion: version + 1,
      },
      correlationId,
    );
    return evidence;
  });
}

export async function analyzeIssue(
  actor: Actor,
  id: string,
  expectedVersion: unknown,
  correlationId = randomUUID(),
) {
  authorize(actor, "playbook:analyze");
  const version = versionSchema.parse(expectedVersion);
  return atomic(async (transaction) => {
    const issue = await issueOrFail(transaction, id);
    unchanged(issue.version, version);
    assert(
      issue.status !== "COMPLETED",
      409,
      "ALREADY_COMPLETED",
      "This issue is already completed.",
    );
    const findings = [
      "Perform the underlying remediation externally; this playbook cannot verify external work.",
      "For access reviews: confirm account justification, revoke unnecessary access, and record the review outcome.",
      "For other findings: document the control gap, implement a corrective action, and record validation results.",
      "A human reviewer must inspect the evidence and independently authorize completion.",
    ];
    const blockers: string[] = [];
    if (!issue.ownerId) blockers.push("Assign a responsible owner.");
    if (issue._count.evidence === 0)
      blockers.push(
        "Attach an evidence reference documenting the completed remediation.",
      );
    if (issue.dueDate < todayUtc())
      findings.push(
        "This issue is overdue. Prioritize remediation and document the delay.",
      );
    if (["HIGH", "CRITICAL"].includes(issue.severity))
      findings.push(
        "Escalate this high-risk finding to the control owner before approving closure.",
      );
    const ready = blockers.length === 0;
    if (ready) {
      const result = await transaction.issue.updateMany({
        where: { id, version },
        data: { status: "PENDING_REVIEW", version: { increment: 1 } },
      });
      assert(
        result.count === 1,
        409,
        "STALE_VERSION",
        "The issue changed. Analyze again.",
      );
    }
    const run = await transaction.playbookRun.create({
      data: {
        issueId: id,
        requesterId: actor.id,
        analyzedVersion: ready ? version + 1 : version,
        findings: {
          playbook: "controlled-remediation-v1",
          recommendations: findings,
          blockers,
        },
        actions: ready ? ["COMPLETE_ISSUE"] : [],
        state: ready ? "PROPOSED" : "BLOCKED",
      },
    });
    await audit(
      transaction,
      actor,
      id,
      "PLAYBOOK_ANALYZED",
      {
        runId: run.id,
        state: run.state,
        analyzedVersion: run.analyzedVersion,
        blockers,
        beforeStatus: issue.status,
        afterStatus: ready ? "PENDING_REVIEW" : issue.status,
      },
      correlationId,
    );
    return run;
  });
}

export async function reviewPlan(
  actor: Actor,
  runId: string,
  input: unknown,
  correlationId = randomUUID(),
) {
  authorize(actor, "approve");
  const decision = decisionSchema.parse(input);
  return atomic(async (transaction) => {
    const run = await transaction.playbookRun.findUnique({
      where: { id: runId },
    });
    assert(run, 404, "NOT_FOUND", "Proposal not found.");
    assert(
      run.requesterId !== actor.id,
      403,
      "SELF_APPROVAL",
      "A requester cannot review their own proposal.",
    );
    assert(
      run.state === "PROPOSED",
      409,
      "NOT_REVIEWABLE",
      "Only a proposed plan can be reviewed once.",
    );
    const issue = await issueOrFail(transaction, run.issueId);
    unchanged(issue.version, run.analyzedVersion);
    assert(
      issue.status === "PENDING_REVIEW" &&
        issue.ownerId &&
        issue._count.evidence > 0,
      409,
      "NOT_READY",
      "The issue is not ready for closure.",
    );
    const approval = await transaction.approval.create({
      data: { ...decision, reviewerId: actor.id, runId },
    });
    await transaction.playbookRun.update({
      where: { id: runId },
      data: { state: decision.approved ? "APPROVED" : "REJECTED" },
    });
    await audit(
      transaction,
      actor,
      issue.id,
      decision.approved ? "PLAN_APPROVED" : "PLAN_REJECTED",
      { runId, analyzedVersion: run.analyzedVersion, note: decision.note },
      correlationId,
    );
    return approval;
  });
}

export async function executePlan(
  actor: Actor,
  runId: string,
  correlationId = randomUUID(),
) {
  authorize(actor, "playbook:execute");
  return atomic(async (transaction) => {
    const run = await transaction.playbookRun.findUnique({
      where: { id: runId },
      include: { approval: { include: { reviewer: true } } },
    });
    assert(run, 404, "NOT_FOUND", "Proposal not found.");
    if (run.state === "EXECUTED")
      return {
        runId: run.id,
        issueId: run.issueId,
        state: "EXECUTED" as const,
        alreadyExecuted: true,
      };
    assert(
      run.state === "APPROVED" && run.approval?.approved,
      409,
      "APPROVAL_REQUIRED",
      "Independent human approval is required before execution.",
    );
    assert(
      run.approval.reviewer.role === "APPROVER" &&
        run.approval.reviewerId !== run.requesterId,
      403,
      "INVALID_APPROVAL",
      "An independent human approver must authorize this proposal.",
    );
    assert(
      Array.isArray(run.actions) &&
        run.actions.length === 1 &&
        run.actions[0] === "COMPLETE_ISSUE",
      409,
      "UNSUPPORTED_ACTION",
      "The proposal contains an unsupported action.",
    );
    const issue = await issueOrFail(transaction, run.issueId);
    unchanged(issue.version, run.analyzedVersion);
    assert(
      issue.status === "PENDING_REVIEW" &&
        issue.ownerId &&
        issue._count.evidence > 0,
      409,
      "NOT_READY",
      "An owner, evidence, and pending review status are required.",
    );
    const result = await transaction.issue.updateMany({
      where: {
        id: issue.id,
        version: run.analyzedVersion,
        status: "PENDING_REVIEW",
      },
      data: { status: "COMPLETED", version: { increment: 1 } },
    });
    assert(
      result.count === 1,
      409,
      "STALE_VERSION",
      "The issue changed. Analyze it again.",
    );
    await transaction.playbookRun.update({
      where: { id: runId },
      data: { state: "EXECUTED", executedAt: new Date() },
    });
    await audit(
      transaction,
      actor,
      issue.id,
      "PLAN_EXECUTED",
      {
        runId,
        approvalId: run.approval.id,
        before: { status: issue.status, version: issue.version },
        after: { status: "COMPLETED", version: issue.version + 1 },
        externalRemediationVerified: false,
      },
      correlationId,
    );
    return {
      runId,
      issueId: issue.id,
      state: "EXECUTED" as const,
      alreadyExecuted: false,
    };
  });
}

export async function getAudit(actor: Actor, issueId: string, cursor?: string) {
  authorize(actor, "issues:read");
  await issueOrFail(db, issueId);
  const items = await db.auditEvent.findMany({
    where: { issueId, ...(cursor ? { id: { lt: cursor } } : {}) },
    include: { actor: person },
    orderBy: { id: "desc" },
    take: 50,
  });
  return { items, nextCursor: items.length === 50 ? items.at(-1)!.id : null };
}

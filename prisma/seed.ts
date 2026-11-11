import { db } from "../src/server/db.ts";
import { Prisma, type Severity, type Status } from "@prisma/client";

const users = [
  { id: "demo-viewer", name: "Sam Rivera", role: "VIEWER" as const },
  { id: "demo-analyst", name: "Alex Morgan", role: "ANALYST" as const },
  { id: "demo-approver", name: "Jordan Lee", role: "APPROVER" as const },
  {
    id: "remediation-agent",
    name: "Remediation agent",
    role: "SERVICE" as const,
  },
];

function dueIn(days: number) {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

async function ensurePendingProposal(
  transaction: Prisma.TransactionClient,
  issue: {
    id: string;
    version: number;
    status: Status;
    ownerId: string | null;
  },
) {
  if (issue.status !== "PENDING_REVIEW" || !issue.ownerId) return;
  const [existingRun, evidenceCount] = await Promise.all([
    transaction.playbookRun.findFirst({ where: { issueId: issue.id } }),
    transaction.evidence.count({ where: { issueId: issue.id } }),
  ]);
  if (existingRun || evidenceCount === 0) return;

  const runId = `seed-run-${issue.id}`;
  const blockers: string[] = [];
  await transaction.playbookRun.create({
    data: {
      id: runId,
      issueId: issue.id,
      requesterId: "demo-analyst",
      analyzedVersion: issue.version,
      findings: {
        playbook: "controlled-remediation-v1",
        recommendations: [
          "Review the tabletop exercise report and document any follow-up actions.",
          "Confirm the evidence reference supports the recorded exercise outcome.",
          "An independent approver must inspect the evidence before closure.",
        ],
        blockers,
      },
      actions: ["COMPLETE_ISSUE"],
      state: "PROPOSED",
    },
  });
  await transaction.auditEvent.create({
    data: {
      issueId: issue.id,
      actorId: "demo-analyst",
      action: "PLAYBOOK_ANALYZED",
      correlationId: `${runId}-analysis`,
      details: {
        source: "demo-seed",
        runId,
        state: "PROPOSED",
        analyzedVersion: issue.version,
        blockers,
      },
    },
  });
}

const issues: {
  id: string;
  title: string;
  description: string;
  severity: Severity;
  status: Status;
  days: number;
  ownerId: string | null;
}[] = [
  {
    id: "CW-101",
    title: "Quarterly access review overdue",
    description:
      "Review privileged access to the finance workspace. Confirm business justification for each account, revoke unnecessary access, and attach the signed review record.",
    severity: "HIGH",
    status: "OPEN",
    days: -5,
    ownerId: "demo-analyst",
  },
  {
    id: "CW-102",
    title: "Vendor security assessment incomplete",
    description:
      "Complete the security assessment for the payroll provider. Obtain the current assurance report and document findings and accepted residual risks.",
    severity: "CRITICAL",
    status: "IN_PROGRESS",
    days: -2,
    ownerId: "demo-analyst",
  },
  {
    id: "CW-103",
    title: "Incident response exercise evidence",
    description:
      "Record the outcome of the tabletop exercise, document follow-up actions, and submit the exercise report for independent review.",
    severity: "MEDIUM",
    status: "PENDING_REVIEW",
    days: 7,
    ownerId: "demo-analyst",
  },
  {
    id: "CW-104",
    title: "Data retention policy acknowledgement",
    description:
      "Collect the outstanding acknowledgements for the updated retention policy and assign a responsible owner for the remaining follow-up.",
    severity: "LOW",
    status: "OPEN",
    days: 14,
    ownerId: null,
  },
  {
    id: "CW-105",
    title: "Backup recovery test completed",
    description:
      "The recovery exercise has been completed. The restoration results and recovery objectives were independently reviewed and approved.",
    severity: "MEDIUM",
    status: "COMPLETED",
    days: -10,
    ownerId: "demo-analyst",
  },
];

try {
  await db.$transaction(async (transaction) => {
    for (const user of users)
      await transaction.user.upsert({
        where: { id: user.id },
        create: user,
        update: {},
      });
    for (const item of issues) {
      const existing = await transaction.issue.findUnique({
        where: { id: item.id },
        select: { id: true, version: true, status: true, ownerId: true },
      });
      if (existing) {
        await ensurePendingProposal(transaction, existing);
        continue;
      }
      const { days, ...data } = item;
      await transaction.issue.create({
        data: { ...data, dueDate: dueIn(days) },
      });
      await transaction.auditEvent.create({
        data: {
          issueId: item.id,
          actorId: "demo-analyst",
          action: "ISSUE_CREATED",
          correlationId: `seed-${item.id}`,
          details: {
            source: "demo-seed",
            status: item.status,
            title: item.title,
          },
        },
      });
      if (item.status === "PENDING_REVIEW" || item.status === "COMPLETED") {
        await transaction.evidence.create({
          data: {
            issueId: item.id,
            url: `https://example.com/evidence/${item.id}`,
            description:
              "Illustrative demo reference; replace with your actual review evidence.",
            submitterId: "demo-analyst",
          },
        });
        await transaction.auditEvent.create({
          data: {
            issueId: item.id,
            actorId: "demo-analyst",
            action: "EVIDENCE_ADDED",
            correlationId: `seed-${item.id}`,
            details: {
              source: "demo-seed",
              url: `https://example.com/evidence/${item.id}`,
            },
          },
        });
      }
      await ensurePendingProposal(transaction, {
        id: item.id,
        version: 1,
        status: item.status,
        ownerId: item.ownerId,
      });
      if (item.status === "COMPLETED") {
        await transaction.playbookRun.create({
          data: {
            id: `seed-run-${item.id}`,
            issueId: item.id,
            requesterId: "demo-analyst",
            analyzedVersion: 1,
            findings: [
              "Illustrative seeded approval and execution, not a live verification of external remediation.",
            ],
            actions: ["COMPLETE_ISSUE"],
            state: "EXECUTED",
            executedAt: new Date(),
            approval: {
              create: {
                reviewerId: "demo-approver",
                approved: true,
                note: "Demo fixture: recovery report reviewed and completion approved.",
              },
            },
          },
        });
        await transaction.auditEvent.create({
          data: {
            issueId: item.id,
            actorId: "demo-approver",
            action: "PLAN_APPROVED",
            correlationId: `seed-${item.id}`,
            details: { source: "demo-seed", runId: `seed-run-${item.id}` },
          },
        });
        await transaction.auditEvent.create({
          data: {
            issueId: item.id,
            actorId: "demo-analyst",
            action: "PLAN_EXECUTED",
            correlationId: `seed-${item.id}`,
            details: {
              source: "demo-seed",
              runId: `seed-run-${item.id}`,
              status: "COMPLETED",
            },
          },
        });
      }
    }
  });
  console.log(
    "Demo data ready: 3 human users, 1 service identity, and 5 sample issues. Existing records were preserved.",
  );
} finally {
  await db.$disconnect();
}

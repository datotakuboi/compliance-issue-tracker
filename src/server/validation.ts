import { z } from "zod";

export const severitySchema = z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]);
export const statusSchema = z.enum([
  "OPEN",
  "IN_PROGRESS",
  "PENDING_REVIEW",
  "COMPLETED",
]);
export const idSchema = z
  .string()
  .min(1)
  .max(100)
  .regex(/^[A-Za-z0-9_-]+$/, "Use a valid record identifier.");
export const versionSchema = z.number().int().positive();
export const dateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD.")
  .refine((value) => {
    const date = new Date(`${value}T00:00:00.000Z`);
    return (
      !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value
    );
  }, "Enter a valid calendar date.");
export const issueSchema = z
  .object({
    title: z.string().trim().min(5).max(160),
    description: z.string().trim().min(10).max(10000),
    severity: severitySchema,
    ownerId: idSchema.nullable(),
    dueDate: dateSchema,
  })
  .strict();
export const updateSchema = issueSchema
  .extend({
    version: versionSchema,
    status: z.enum(["OPEN", "IN_PROGRESS", "PENDING_REVIEW"]),
  })
  .strict();
export const evidenceSchema = z
  .object({
    version: versionSchema,
    url: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => {
        const url = new URL(value);
        return (
          ["http:", "https:"].includes(url.protocol) &&
          !url.username &&
          !url.password
        );
      }, "Use an HTTP(S) URL without embedded credentials."),
    description: z.string().trim().min(5).max(1000),
  })
  .strict();
export const decisionSchema = z
  .object({ approved: z.boolean(), note: z.string().trim().min(10).max(2000) })
  .strict();
export const filterSchema = z
  .object({
    status: statusSchema.optional(),
    severity: severitySchema.optional(),
    ownerId: idSchema.optional(),
    query: z.string().max(160).optional(),
    overdue: z.enum(["true", "false"]).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
export const auditFilterSchema = z
  .object({
    issueId: idSchema.optional(),
    actorId: idSchema.optional(),
    action: z.string().trim().min(1).max(64).optional(),
    query: z.string().trim().max(160).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();

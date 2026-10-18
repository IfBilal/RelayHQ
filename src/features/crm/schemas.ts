import { z } from "zod";

const uuid = z.uuid();
const trimmed = (max: number) => z.string().trim().min(1).max(max);

/** E.164 with a leading +, as stored. Spaces, dashes and brackets are stripped before checking. */
export const phoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s().-]/g, ""))
  .pipe(z.string().regex(/^\+[1-9][0-9]{6,14}$/, "Use international format, e.g. +14155550184"));

export const contactCreateSchema = z.object({
  name: trimmed(160),
  email: z.email().max(254).optional().or(z.literal("").transform(() => undefined)),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  companyName: z.string().trim().max(160).optional(),
});
export type ContactCreateInput = z.infer<typeof contactCreateSchema>;

export const contactUpdateSchema = z
  .object({
    expectedVersion: z.number().int().positive(),
    name: trimmed(160).optional(),
    email: z.email().max(254).nullable().optional(),
    phone: phoneSchema.nullable().optional(),
    optedOut: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 1, "Nothing to update");

export const contactListQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  cursor: z.string().max(200).optional(), // opaque keyset cursor: "<created_at>|<id>"
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const opportunityCreateSchema = z.object({
  contactId: uuid,
  pipelineId: uuid,
  stageId: uuid,
  title: trimmed(160),
  currency: z.string().regex(/^[A-Z]{3}$/).default("USD"),
  /** Major units from the form, converted to integer minor units on the server. */
  value: z.number().nonnegative().max(1_000_000_000).optional(),
  customValues: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
});

export const stageMoveSchema = z.object({
  targetStageId: uuid,
  expectedVersion: z.number().int().positive(),
});

export const noteSchema = z.object({
  contactId: uuid,
  opportunityId: uuid.optional(),
  body: trimmed(4000),
});

/** Zero-decimal currencies would need a table; the product starts with two-decimal currencies. */
export const toMinorUnits = (major: number) => Math.round(major * 100);
export const fromMinorUnits = (minor: number) => minor / 100;

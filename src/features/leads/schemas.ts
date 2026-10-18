import { z } from "zod";
import { phoneSchema } from "@/features/crm/schemas";
import { AVAILABILITY } from "@/contracts/permissions";

const uuid = z.uuid();

export const manualLeadSchema = z.object({
  contactId: uuid,
  summary: z.string().trim().max(500).default(""),
});

export const publicLeadSchema = z.object({
  name: z.string().trim().min(1).max(160),
  email: z.email().max(254).optional().or(z.literal("").transform(() => undefined)),
  phone: phoneSchema.optional().or(z.literal("").transform(() => undefined)),
  summary: z.string().trim().max(500).default(""),
  /** Honeypot: real visitors never see or fill this field. */
  website: z.string().max(200).optional(),
  /** Client-generated per form render, so a double submit is one lead. */
  dedupeKey: z.string().trim().min(8).max(100).optional(),
});

export const versionSchema = z.object({ expectedVersion: z.number().int().positive() });

export const reassignSchema = z.object({
  ownerUserId: uuid,
  reason: z.string().trim().max(200).default(""),
  expectedVersion: z.number().int().positive(),
});

export const availabilitySchema = z.object({ status: z.enum(AVAILABILITY) });

export const rulesSchema = z.object({
  maxOpenLeads: z.number().int().min(1).max(500),
  /** One entry per escalation level, in seconds (kept short so the flow can be demoed). */
  windowsSeconds: z.array(z.number().int().min(1).max(86_400)).min(1).max(8),
  alternateLevels: z.number().int().min(0).max(5),
  backupUserId: uuid.nullable(),
  managerUserId: uuid.nullable(),
  idleSeconds: z.number().int().min(10).max(604_800),
  reassignOnAbsence: z.boolean(),
});
export type RulesInput = z.infer<typeof rulesSchema>;

export const REASON_LABEL: Record<string, string> = {
  PAST_DUE_UNACKNOWLEDGED: "Past response deadline",
  ESCALATED_TWICE: "Escalated twice",
  IDLE_TOO_LONG: "No recent activity",
  NO_ELIGIBLE_EMPLOYEE: "No available employee",
  FAILED_EXTERNAL_ALERT: "Alert not delivered",
};

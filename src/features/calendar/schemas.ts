import { z } from "zod";

export const bookAppointmentSchema = z.object({
  contactId: z.uuid(),
  employeeUserId: z.uuid(),
  purpose: z.string().trim().min(1).max(120),
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480).default(30),
  timezone: z.string().min(1).max(64),
});

export const rescheduleSchema = z.object({
  startsAt: z.iso.datetime({ offset: true }),
  durationMinutes: z.number().int().min(15).max(480).default(30),
});

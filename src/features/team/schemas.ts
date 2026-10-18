import { z } from "zod";
import { PERMISSIONS } from "@/contracts/permissions";

export const inviteSchema = z.object({
  email: z.email().max(254),
  baseRole: z.enum(["admin", "user"]),
  roleId: z.uuid(),
});

export const accessSchema = z.object({
  baseRole: z.enum(["admin", "user"]),
  roleId: z.uuid(),
  enabled: z.boolean(),
});

export const rolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).max(PERMISSIONS.length),
});

export const acceptSchema = z.object({ token: z.string().trim().min(20).max(200) });

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(80),
  timezone: z.string().trim().max(64).refine((tz) => {
    try {
      new Intl.DateTimeFormat("en", { timeZone: tz });
      return true;
    } catch {
      return false;
    }
  }, "Pick a valid time zone."),
  // omitted = leave unchanged; null or "" = clear
  notificationEmail: z.email().max(254).nullable().or(z.literal("").transform(() => null)).optional(),
});

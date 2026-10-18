/** Permission strings. Must match rows in `public.permissions` (migration 20261018000001). */
export const PERMISSIONS = [
  "crm.view",
  "crm.create",
  "crm.edit",
  "crm.delete",
  "crm.export",
  "opportunity.value.view",
  "pipeline.manage",
  "lead.view",
  "lead.create",
  "lead.reassign",
  "assignment.manage",
  "conversation.view",
  "message.send",
  "payment.create",
  "appointment.view",
  "appointment.create",
  "integrations.manage",
  "audit.view",
  "dashboard.view",
  "team.invite",
  "role.manage",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const BASE_ROLES = ["owner", "admin", "user"] as const;
export type BaseRole = (typeof BASE_ROLES)[number];

export const AVAILABILITY = ["available", "busy", "on_leave", "offline"] as const;
export type Availability = (typeof AVAILABILITY)[number];

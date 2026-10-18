import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";
import type { AssignmentRules, LeadRow, RecoveryRow, TeamMember } from "../types";

const LEAD_COLUMNS =
  "id, contact_id, source, summary, owner_user_id, status, current_level, escalation_count, emergency, assigned_at, first_assigned_at, first_acknowledged_at, acknowledged_at, deadline_at, version, created_at";

/** RLS already limits rows: managers see every lead, everyone else only the ones they own. */
export async function listLeads(ctx: SessionContext, opts: { status?: "open" | "closed"; limit?: number } = {}) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leads")
    .select(LEAD_COLUMNS)
    .eq("workspace_id", ctx.workspace.id)
    .eq("status", opts.status ?? "open")
    .order("created_at", { ascending: false })
    .limit(opts.limit ?? 100);
  if (error) return { error } as const;

  const leads = (data ?? []) as LeadRow[];
  const [contacts, owners] = await Promise.all([
    lookup("contacts", leads.map((l) => l.contact_id), "id, name"),
    lookup("profiles", leads.map((l) => l.owner_user_id), "id, display_name"),
  ]);
  return {
    items: leads.map((l) => ({
      ...l,
      contact_name: contacts.get(l.contact_id)?.name ?? "Unknown contact",
      owner_name: owners.get(l.owner_user_id)?.display_name ?? null,
    })),
  } as const;
}

async function lookup(table: "contacts" | "profiles", ids: string[], columns: string) {
  const unique = [...new Set(ids)];
  const out = new Map<string, Record<string, string | null>>();
  if (!unique.length) return out;
  const supabase = await createClient();
  const { data } = await supabase.from(table).select(columns).in("id", unique);
  (data as unknown as Record<string, string | null>[] | null)?.forEach((row) => out.set(row.id as string, row));
  return out;
}

export async function getLead(ctx: SessionContext, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("leads").select(LEAD_COLUMNS).eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
  if (!data) return null;
  const lead = data as LeadRow;
  const [contacts, owners, events] = await Promise.all([
    lookup("contacts", [lead.contact_id], "id, name, phone_e164, email"),
    lookup("profiles", [lead.owner_user_id], "id, display_name"),
    supabase
      .from("lead_assignment_events")
      .select("id, from_user_id, to_user_id, cause, level, created_at")
      .eq("lead_id", id)
      .order("created_at"),
  ]);
  const people = await lookup(
    "profiles",
    (events.data ?? []).flatMap((e) => [e.from_user_id, e.to_user_id].filter((x): x is string => !!x)),
    "id, display_name",
  );
  return {
    lead,
    contact: contacts.get(lead.contact_id) ?? null,
    ownerName: owners.get(lead.owner_user_id)?.display_name ?? null,
    events: (events.data ?? []).map((e) => ({
      ...e,
      from_name: e.from_user_id ? (people.get(e.from_user_id)?.display_name ?? null) : null,
      to_name: people.get(e.to_user_id)?.display_name ?? null,
    })),
  };
}

export async function recoveryQueue(ctx: SessionContext) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("recovery_queue", { p_workspace: ctx.workspace.id });
  if (error) return { error } as const;
  return { items: (data ?? []) as RecoveryRow[] } as const;
}

export async function teamOverview(ctx: SessionContext) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("team_overview", { p_workspace: ctx.workspace.id });
  if (error) return { error } as const;
  return { items: ((data ?? []) as TeamMember[]).map((m) => ({ ...m, open_leads: Number(m.open_leads) })) } as const;
}

export async function getRules(ctx: SessionContext) {
  const supabase = await createClient();
  const { data } = await supabase.from("assignment_rules").select("*").eq("workspace_id", ctx.workspace.id).maybeSingle();
  return (data as AssignmentRules | null) ?? null;
}

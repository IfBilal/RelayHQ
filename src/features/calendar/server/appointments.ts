import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface AppointmentRow {
  id: string; purpose: string; starts_at: string; ends_at: string; timezone: string; status: "pending" | "confirmed" | "cancelled" | "error";
  google_event_id: string | null; last_error: string | null; contact_name: string; employee_name: string; employee_user_id: string;
}

export async function loadAppointments(ctx: SessionContext, weekStart: Date) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const weekEnd = new Date(weekStart.getTime() + 7 * 86_400_000);
  const [appts, members, connections, contacts] = await Promise.all([
    supabase.from("appointments").select("id, purpose, starts_at, ends_at, timezone, status, google_event_id, last_error, contact_id, employee_user_id")
      .eq("workspace_id", ws).gte("starts_at", weekStart.toISOString()).lt("starts_at", weekEnd.toISOString()).order("starts_at"),
    supabase.from("memberships").select("user_id").eq("workspace_id", ws).eq("enabled", true),
    supabase.from("calendar_connections").select("user_id, google_email, status, last_error, last_success_at").eq("workspace_id", ws),
    supabase.from("contacts").select("id, name").eq("workspace_id", ws).order("name").limit(500),
  ]);
  if (appts.error) return { error: appts.error } as const;
  const ids = (members.data ?? []).map((m) => m.user_id);
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, display_name").in("id", ids) : { data: [] as { id: string; display_name: string }[] };
  const name = new Map((profiles ?? []).map((p) => [p.id, p.display_name || "Team member"]));
  const cname = new Map((contacts.data ?? []).map((c) => [c.id, c.name]));
  const connected = new Map((connections.data ?? []).map((c) => [c.user_id, c]));
  return {
    items: (appts.data ?? []).map((a) => ({ ...a, contact_name: cname.get(a.contact_id) ?? "Customer", employee_name: name.get(a.employee_user_id) ?? "Team member" })) as AppointmentRow[],
    employees: ids.map((id) => ({ id, name: name.get(id) ?? "Team member", connection: connected.get(id) ?? null })),
    contacts: (contacts.data ?? []).map((c) => ({ id: c.id, name: c.name })),
    mine: connected.get(ctx.user.id) ?? null,
  } as const;
}

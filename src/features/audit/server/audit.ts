import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface AuditFilters {
  action?: string;
  actor?: string;
  from?: string;
  to?: string;
  cursor?: string;
  limit: number;
}

export interface AuditRow {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_user_id: string | null;
  actor_name: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
}

/** Read-only. Visibility is enforced by RLS (audit.view); there is no write path from the application. */
export async function listAudit(ctx: SessionContext, f: AuditFilters) {
  const supabase = await createClient();
  let query = supabase
    .from("audit_events")
    .select("id, action, entity_type, entity_id, actor_user_id, before, after, created_at")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(f.limit + 1);
  if (f.action) query = query.like("action", `${f.action.replace(/[%_\\]/g, "")}%`);
  if (f.actor === "system") query = query.is("actor_user_id", null);
  else if (f.actor) query = query.eq("actor_user_id", f.actor);
  if (f.from) query = query.gte("created_at", f.from);
  if (f.to) query = query.lt("created_at", f.to);
  if (f.cursor) {
    const [createdAt, id] = f.cursor.split("|");
    if (createdAt && id && /^[0-9a-f-]{36}$/.test(id) && !Number.isNaN(Date.parse(createdAt))) {
      query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
  }
  const { data, error } = await query;
  if (error) return { error } as const;

  const rows = (data ?? []).slice(0, f.limit);
  const actorIds = [...new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", actorIds);
    profiles?.forEach((p) => names.set(p.id, p.display_name));
  }
  const last = rows.at(-1);
  return {
    items: rows.map((r) => ({ ...r, actor_name: r.actor_user_id ? (names.get(r.actor_user_id) ?? "Former member") : null })) as AuditRow[],
    nextCursor: data!.length > f.limit && last ? `${last.created_at}|${last.id}` : null,
  } as const;
}

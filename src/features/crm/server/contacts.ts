import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";
import type { ActivityRow, ContactRow, OpportunityRow } from "../types";

const CONTACT_COLUMNS = "id, name, email, phone_e164, owner_user_id, opted_out, version, created_at, company_id";

type RawContact = Omit<ContactRow, "company"> & { company_id: string | null };

async function withCompanies(rows: RawContact[]): Promise<ContactRow[]> {
  const ids = [...new Set(rows.map((r) => r.company_id).filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (ids.length) {
    const supabase = await createClient();
    const { data } = await supabase.from("companies").select("id, name").in("id", ids);
    data?.forEach((c) => names.set(c.id, c.name));
  }
  return rows.map(({ company_id, ...rest }) => ({
    ...rest,
    company: company_id && names.has(company_id) ? { id: company_id, name: names.get(company_id)! } : null,
  }));
}

/** Keyset pagination on (created_at desc, id desc); the cursor is opaque to callers. */
export async function listContacts(ctx: SessionContext, opts: { q?: string; cursor?: string; limit: number }) {
  const supabase = await createClient();
  let query = supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(opts.limit + 1);

  const q = opts.q?.replace(/[%_,()*\\]/g, "").trim();
  if (q) {
    if (q.includes("@")) query = query.ilike("email", `%${q}%`);
    else if (/^[+\d\s-]+$/.test(q)) query = query.ilike("phone_e164", `%${q.replace(/[\s-]/g, "")}%`);
    else query = query.ilike("name", `%${q}%`);
  }
  if (opts.cursor) {
    const [createdAt, id] = opts.cursor.split("|");
    if (createdAt && id && /^[0-9a-f-]{36}$/.test(id) && !Number.isNaN(Date.parse(createdAt))) {
      query = query.or(`created_at.lt.${createdAt},and(created_at.eq.${createdAt},id.lt.${id})`);
    }
  }

  const { data, error } = await query;
  if (error) return { error } as const;
  const hasMore = data.length > opts.limit;
  const page = data.slice(0, opts.limit) as RawContact[];
  const last = page.at(-1);
  return {
    items: await withCompanies(page),
    nextCursor: hasMore && last ? `${last.created_at}|${last.id}` : null,
  } as const;
}

export async function createContact(
  ctx: SessionContext,
  input: { name: string; email?: string; phone?: string; companyName?: string },
) {
  const supabase = await createClient();
  let companyId: string | null = null;
  if (input.companyName) {
    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("workspace_id", ctx.workspace.id)
      .is("archived_at", null)
      .ilike("name", input.companyName.replace(/[%_\\]/g, ""))
      .limit(1)
      .maybeSingle();
    if (existing) companyId = existing.id;
    else {
      const { data: created, error } = await supabase
        .from("companies")
        .insert({ workspace_id: ctx.workspace.id, name: input.companyName })
        .select("id")
        .single();
      if (error) return { error } as const;
      companyId = created.id;
    }
  }
  const { data, error } = await supabase
    .from("contacts")
    .insert({
      workspace_id: ctx.workspace.id,
      name: input.name,
      email: input.email ?? null,
      phone_e164: input.phone ?? null,
      company_id: companyId,
      owner_user_id: ctx.user.id,
    })
    .select(CONTACT_COLUMNS)
    .single();
  if (error) return { error } as const;
  return { contact: (await withCompanies([data as RawContact]))[0] } as const;
}

export async function updateContact(
  ctx: SessionContext,
  id: string,
  patch: { expectedVersion: number; name?: string; email?: string | null; phone?: string | null; optedOut?: boolean },
) {
  const supabase = await createClient();
  const values: Record<string, unknown> = {};
  if (patch.name !== undefined) values.name = patch.name;
  if (patch.email !== undefined) values.email = patch.email;
  if (patch.phone !== undefined) values.phone_e164 = patch.phone;
  if (patch.optedOut !== undefined) values.opted_out = patch.optedOut;

  // The version filter makes a concurrent edit a conflict instead of a silent overwrite.
  const { data, error } = await supabase
    .from("contacts")
    .update(values)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .eq("version", patch.expectedVersion)
    .select(CONTACT_COLUMNS);
  if (error) return { error } as const;
  if (!data.length) {
    const { data: exists } = await supabase.from("contacts").select("id").eq("id", id).eq("workspace_id", ctx.workspace.id).maybeSingle();
    return { notFound: !exists, stale: !!exists } as const;
  }
  return { contact: (await withCompanies([data[0] as RawContact]))[0] } as const;
}

/** Everything the Contact 360 screen needs: record, related opportunities and the activity timeline. */
export async function getContact360(ctx: SessionContext, id: string) {
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("contacts")
    .select(CONTACT_COLUMNS)
    .eq("id", id)
    .eq("workspace_id", ctx.workspace.id)
    .maybeSingle();
  if (!row) return null;
  const [contact] = await withCompanies([row as RawContact]);

  const [{ data: opps }, { data: activity }, ownerProfile] = await Promise.all([
    supabase
      .from("opportunities")
      .select("id, title, contact_id, stage_id, pipeline_id, currency, version, created_at, custom_values")
      .eq("workspace_id", ctx.workspace.id)
      .eq("contact_id", id)
      .is("archived_at", null)
      .order("created_at", { ascending: false }),
    supabase
      .from("activity_events")
      .select("id, kind, body, data, actor_user_id, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .limit(50),
    row.owner_user_id
      ? supabase.from("profiles").select("display_name").eq("id", row.owner_user_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  let values = new Map<string, number>();
  if (opps?.length && ctx.permissions.includes("opportunity.value.view")) {
    const { data } = await supabase.rpc("opportunity_values", { p_workspace: ctx.workspace.id, p_ids: opps.map((o) => o.id) });
    values = new Map((data ?? []).map((v: { opportunity_id: string; value_minor: number }) => [v.opportunity_id, Number(v.value_minor)]));
  }

  const stageIds = [...new Set((opps ?? []).map((o) => o.stage_id))];
  const stageNames = new Map<string, string>();
  if (stageIds.length) {
    const { data } = await supabase.from("stages").select("id, name").in("id", stageIds);
    data?.forEach((s) => stageNames.set(s.id, s.name));
  }

  const actorIds = [...new Set((activity ?? []).map((a) => a.actor_user_id).filter((x): x is string => !!x))];
  const actors = new Map<string, string>();
  if (actorIds.length) {
    const { data } = await supabase.from("profiles").select("id, display_name").in("id", actorIds);
    data?.forEach((p) => actors.set(p.id, p.display_name));
  }

  return {
    contact,
    ownerName: ownerProfile.data?.display_name ?? null,
    opportunities: (opps ?? []).map((o) => ({
      ...(o as OpportunityRow),
      stage_name: stageNames.get(o.stage_id) ?? "",
      ...(values.has(o.id) ? { value_minor: values.get(o.id)! } : {}), // key omitted without permission
    })),
    activity: ((activity ?? []) as ActivityRow[]).map((a) => ({ ...a, actor_name: a.actor_user_id ? actors.get(a.actor_user_id) ?? null : null })),
  };
}

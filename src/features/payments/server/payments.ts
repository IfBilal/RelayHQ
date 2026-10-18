import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface PaymentRow {
  id: string;
  status: "pending" | "paid" | "failed" | "expired" | "refunded" | "partially_refunded";
  amount_minor: number;
  currency: string;
  refunded_minor: number;
  checkout_url: string | null;
  failure_reason: string | null;
  created_at: string;
  paid_at: string | null;
  opportunity_title: string;
  contact_name: string;
}

/** Reads through RLS (payment.create or opportunity.value.view). */
export async function listPayments(ctx: SessionContext) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payment_requests")
    .select("id, status, amount_minor, currency, refunded_minor, checkout_url, failure_reason, created_at, paid_at, opportunity_id, contact_id")
    .eq("workspace_id", ctx.workspace.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return { error } as const;
  const oppIds = [...new Set((data ?? []).map((p) => p.opportunity_id))];
  const contactIds = [...new Set((data ?? []).map((p) => p.contact_id))];
  const [opps, contacts] = await Promise.all([
    oppIds.length ? supabase.from("opportunities").select("id, title").in("id", oppIds) : Promise.resolve({ data: [] as { id: string; title: string }[] }),
    contactIds.length ? supabase.from("contacts").select("id, name").in("id", contactIds) : Promise.resolve({ data: [] as { id: string; name: string }[] }),
  ]);
  const title = new Map((opps.data ?? []).map((o) => [o.id, o.title]));
  const name = new Map((contacts.data ?? []).map((c) => [c.id, c.name]));
  return {
    items: (data ?? []).map((p) => ({
      id: p.id,
      status: p.status,
      amount_minor: Number(p.amount_minor),
      currency: p.currency,
      refunded_minor: Number(p.refunded_minor),
      checkout_url: p.status === "pending" ? p.checkout_url : null,
      failure_reason: p.failure_reason,
      created_at: p.created_at,
      paid_at: p.paid_at,
      opportunity_title: title.get(p.opportunity_id) ?? "",
      contact_name: name.get(p.contact_id) ?? "",
    })) as PaymentRow[],
  } as const;
}

/** Opportunities a payment can be requested for (RLS-scoped, newest first). */
export async function openOpportunities(ctx: SessionContext) {
  const supabase = await createClient();
  const { data } = await supabase.from("opportunities").select("id, title").eq("workspace_id", ctx.workspace.id).is("archived_at", null).order("created_at", { ascending: false }).limit(100);
  return (data ?? []) as { id: string; title: string }[];
}

/** Collected this month: verified gross minus confirmed refunds. Null when the viewer lacks the value permission. */
export async function collectedThisMonth(ctx: SessionContext) {
  if (!ctx.permissions.includes("opportunity.value.view")) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("collected_summary", { p_workspace: ctx.workspace.id });
  if (error) return null;
  const rows = (data ?? []) as { currency: string; collected_minor: number; paid_count: number }[];
  // workspace currency only: summing across currencies would be wrong
  const row = rows.find((r) => r.currency === ctx.workspace.currency);
  return row ? { minor: Number(row.collected_minor), currency: row.currency, count: Number(row.paid_count) } : { minor: 0, currency: ctx.workspace.currency, count: 0 };
}

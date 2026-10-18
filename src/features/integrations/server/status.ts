import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface ProviderStatus { key: "stripe" | "google" | "email"; name: string; sub: string; configured: boolean; connected: boolean; detail: string; lastAt: string | null; lastError: string | null }

export async function loadIntegrations(ctx: SessionContext) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const [events, connections, outbox, lastPaid] = await Promise.all([
    supabase.from("integration_events").select("id, provider, event_id, event_type, status, detail, deliveries, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    supabase.from("calendar_connections").select("user_id, google_email, status, last_error, last_success_at").eq("workspace_id", ws),
    supabase.from("outbox_events").select("id, status, attempts, last_error, created_at, sent_at, kind").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    supabase.from("payment_requests").select("paid_at").eq("workspace_id", ws).not("paid_at", "is", null).order("paid_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  const stripeEvents = (events.data ?? []).filter((e) => e.provider === "stripe");
  const conns = connections.data ?? [];
  const ob = outbox.data ?? [];
  const lastSent = ob.find((o) => o.sent_at)?.sent_at ?? null;
  const lastFailed = ob.find((o) => o.status === "failed") ?? null;
  const providers: ProviderStatus[] = [
    {
      key: "stripe", name: "Stripe Payments", sub: "Hosted checkout & signed payment webhooks",
      configured: Boolean(process.env.STRIPE_SECRET_KEY), connected: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET),
      detail: !process.env.STRIPE_SECRET_KEY ? "STRIPE_SECRET_KEY missing" : !process.env.STRIPE_WEBHOOK_SECRET ? "Checkout works; webhook secret missing so payments cannot be confirmed" : `${stripeEvents.length} verified events`,
      lastAt: lastPaid.data?.paid_at ?? stripeEvents[0]?.created_at ?? null, lastError: stripeEvents.find((e) => e.status === "rejected" || e.status === "failed")?.detail ?? null,
    },
    {
      key: "google", name: "Google Calendar", sub: "Per-employee OAuth (PKCE), FreeBusy before every booking",
      configured: Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET), connected: conns.some((c) => c.status === "connected"),
      detail: `${conns.filter((c) => c.status === "connected").length} of ${conns.length || 0} connected calendars`,
      lastAt: conns.map((c) => c.last_success_at).filter(Boolean).sort().at(-1) ?? null, lastError: conns.find((c) => c.last_error)?.last_error ?? null,
    },
    {
      key: "email", name: "Email alerts (SMTP)", sub: "Escalation notifications through the transactional outbox",
      configured: Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM), connected: Boolean(lastSent),
      detail: !process.env.SMTP_HOST ? "SMTP_* variables missing" : `${ob.filter((o) => o.sent_at).length} sent · ${ob.filter((o) => o.status === "failed").length} failed`,
      lastAt: lastSent, lastError: lastFailed?.last_error ?? null,
    },
  ];
  return { providers, events: events.data ?? [], outbox: ob, connections: conns, error: events.error ?? outbox.error ?? null };
}

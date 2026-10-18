import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export type ProviderState = "not_configured" | "configured" | "attention";

export interface ProviderCard {
  key: "stripe" | "google" | "email";
  name: string;
  state: ProviderState;
  facts: string[];
  lastSuccess: string | null;
  lastError: { at: string; text: string } | null;
  limits: string;
}

export interface EventRow {
  id: string;
  provider: "stripe" | "google" | "email";
  label: string;
  status: string;
  detail: string | null;
  at: string;
  deliveries?: number;
  retryable?: boolean;
}

/** What is configured on this deployment. Names only: values never leave the server. */
export function providerConfig() {
  const e = process.env;
  const stripeKey = e.STRIPE_SECRET_KEY ?? "";
  return {
    stripe: { configured: Boolean(stripeKey && e.STRIPE_WEBHOOK_SECRET), testMode: stripeKey.startsWith("sk_test_"), hasKey: Boolean(stripeKey), hasWebhookSecret: Boolean(e.STRIPE_WEBHOOK_SECRET) },
    google: { configured: Boolean(e.GOOGLE_CLIENT_ID && e.GOOGLE_CLIENT_SECRET && e.GOOGLE_REDIRECT_URI && e.INTEGRATION_ENCRYPTION_KEY) },
    email: { configured: Boolean(e.SMTP_HOST && e.SMTP_PORT && e.SMTP_USER && e.SMTP_PASS && e.SMTP_FROM), dispatcher: Boolean(e.CRON_DISPATCH_SECRET && e.SUPABASE_SERVICE_ROLE_KEY) },
  };
}

const ms = (iso: string | null | undefined) => (iso ? Date.parse(iso) : Number.NEGATIVE_INFINITY);

/** Provider error text can carry addresses or hosts: show a short, address-masked version only. */
export function safeDetail(s: string | null, n = 140): string | null {
  if (!s) return null;
  return s.replace(/[^\s<>"']+@[^\s<>"']+/g, "[address]").slice(0, n);
}

/** Everything reads through RLS: only integrations.manage holders see events and outbox rows of their workspace. */
export async function loadIntegrations(ctx: SessionContext) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const [events, outbox] = await Promise.all([
    supabase.from("integration_events").select("id, provider, event_type, status, detail, deliveries, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
    supabase.from("outbox_events").select("id, kind, status, attempts, last_error, sent_at, last_attempt_at, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(100),
  ]);
  if (events.error || outbox.error) {
    console.error("integrations load failed", { events: events.error?.code, outbox: outbox.error?.code });
    return { error: true } as const;
  }

  const cfg = providerConfig();
  const ev = events.data ?? [];
  const ox = outbox.data ?? [];

  // Stripe: latest processed vs latest failed event, by real timestamps
  const stripeEvents = ev.filter((e) => e.provider === "stripe");
  const stripeOk = stripeEvents.filter((e) => e.status === "processed").sort((a, b) => ms(b.created_at) - ms(a.created_at))[0];
  const stripeBad = stripeEvents.filter((e) => e.status === "failed").sort((a, b) => ms(b.created_at) - ms(a.created_at))[0];

  // Email: latest send vs latest failed attempt (when it failed, not when it was queued)
  const emailSent = ox.filter((o) => o.status === "sent").sort((a, b) => ms(b.sent_at) - ms(a.sent_at))[0];
  const failedAt = (o: { last_attempt_at: string | null; created_at: string }) => o.last_attempt_at ?? o.created_at;
  const emailBad = ox.filter((o) => o.status === "failed" || o.status === "dead").sort((a, b) => ms(failedAt(b)) - ms(failedAt(a)))[0];

  const stripe: ProviderCard = {
    key: "stripe",
    name: "Stripe payments",
    state: !cfg.stripe.configured ? "not_configured" : stripeBad && ms(stripeBad.created_at) > ms(stripeOk?.created_at) ? "attention" : "configured",
    facts: [cfg.stripe.hasKey ? (cfg.stripe.testMode ? "API key set (test mode)" : "API key set (live mode)") : "API key missing", cfg.stripe.hasWebhookSecret ? "Webhook signing secret set" : "Webhook signing secret missing"],
    lastSuccess: stripeOk?.created_at ?? null,
    lastError: stripeBad ? { at: stripeBad.created_at, text: safeDetail(stripeBad.detail) ?? "Event failed" } : null,
    limits: `${cfg.stripe.testMode ? "Test mode." : "Check the mode before taking real payments."} A payment is marked paid solely by Stripe's signed webhook; refunds reduce collected revenue.`,
  };
  const google: ProviderCard = {
    key: "google",
    name: "Google Calendar",
    state: cfg.google.configured ? "configured" : "not_configured",
    facts: [cfg.google.configured ? "OAuth client configured" : "OAuth client or encryption key missing", "Each person connects their own calendar"],
    lastSuccess: null,
    lastError: null,
    limits: "Per-employee sign-in. A calendar is checked for clashes before booking; a revoked connection must be reconnected.",
  };
  const email: ProviderCard = {
    key: "email",
    name: "Email alerts (SMTP)",
    state: !cfg.email.configured ? "not_configured" : emailBad && ms(failedAt(emailBad)) > ms(emailSent?.sent_at) ? "attention" : "configured",
    facts: [cfg.email.configured ? "SMTP credentials set" : "SMTP credentials missing", cfg.email.dispatcher ? "Dispatcher secret set" : "Dispatcher secret or service key missing"],
    lastSuccess: emailSent?.sent_at ?? null,
    lastError: emailBad ? { at: failedAt(emailBad), text: safeDetail(emailBad.last_error) ?? "Send failed" } : null,
    limits: "Escalation alerts only. Failed sends retry with backoff, then stop; admins can retry them here (once a minute per alert).",
  };

  const rows: EventRow[] = [
    ...ev.map((e) => ({ id: e.id, provider: e.provider as EventRow["provider"], label: e.event_type ?? "event", status: e.status, detail: safeDetail(e.detail), at: e.created_at, deliveries: e.deliveries })),
    ...ox.map((o) => ({ id: o.id, provider: "email" as const, label: `Alert (${o.kind})`, status: o.status, detail: safeDetail(o.last_error), at: o.sent_at ?? o.last_attempt_at ?? o.created_at, retryable: o.status === "failed" || o.status === "dead" })),
  ].sort((a, b) => ms(b.at) - ms(a.at)).slice(0, 60);

  return { cards: [stripe, google, email], rows } as const;
}

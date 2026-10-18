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

const short = (s: string | null, n = 140) => (s ? s.slice(0, n) : null);

/** Everything reads through RLS: only integrations.manage holders see events and outbox rows of their workspace. */
export async function loadIntegrations(ctx: SessionContext, extra?: { google?: { connected: number; reconnect: number; lastError: { at: string; text: string } | null; lastSuccess: string | null } }) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const [events, outbox] = await Promise.all([
    supabase.from("integration_events").select("id, provider, event_type, status, detail, deliveries, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(50),
    supabase.from("outbox_events").select("id, kind, status, attempts, last_error, sent_at, created_at").eq("workspace_id", ws).order("created_at", { ascending: false }).limit(30),
  ]);
  if (events.error || outbox.error) return { error: true } as const;

  const cfg = providerConfig();
  const ev = events.data ?? [];
  const ox = outbox.data ?? [];
  const stripeEvents = ev.filter((e) => e.provider === "stripe");
  const stripeOk = stripeEvents.find((e) => e.status === "processed");
  const stripeBad = stripeEvents.find((e) => e.status === "failed");
  const emailSent = ox.find((o) => o.status === "sent");
  const emailBad = ox.find((o) => o.status === "failed" || o.status === "dead");
  const g = extra?.google;

  const stripe: ProviderCard = {
    key: "stripe",
    name: "Stripe payments",
    state: !cfg.stripe.configured ? "not_configured" : stripeBad && (!stripeOk || stripeBad.created_at > stripeOk.created_at) ? "attention" : "configured",
    facts: [cfg.stripe.hasKey ? (cfg.stripe.testMode ? "API key set (test mode)" : "API key set") : "API key missing", cfg.stripe.hasWebhookSecret ? "Webhook signing secret set" : "Webhook signing secret missing"],
    lastSuccess: stripeOk?.created_at ?? null,
    lastError: stripeBad ? { at: stripeBad.created_at, text: short(stripeBad.detail) ?? "Event failed" } : null,
    limits: "Test mode only. A payment is marked paid solely by Stripe's signed webhook; refunds reduce collected revenue.",
  };
  const google: ProviderCard = {
    key: "google",
    name: "Google Calendar",
    state: !cfg.google.configured ? "not_configured" : g && g.reconnect > 0 ? "attention" : "configured",
    facts: [cfg.google.configured ? "OAuth client configured" : "OAuth client or encryption key missing", g ? `${g.connected} connected ${g.connected === 1 ? "calendar" : "calendars"}` : "Each person connects their own calendar"],
    lastSuccess: g?.lastSuccess ?? null,
    lastError: g?.lastError ?? null,
    limits: "Per-employee sign-in. A calendar is checked for clashes before booking; a revoked connection must be reconnected.",
  };
  const email: ProviderCard = {
    key: "email",
    name: "Email alerts (SMTP)",
    state: !cfg.email.configured ? "not_configured" : emailBad && (!emailSent || emailBad.created_at > (emailSent.sent_at ?? "")) ? "attention" : "configured",
    facts: [cfg.email.configured ? "SMTP credentials set" : "SMTP credentials missing", cfg.email.dispatcher ? "Dispatcher secret set" : "Dispatcher secret or service key missing"],
    lastSuccess: emailSent?.sent_at ?? null,
    lastError: emailBad ? { at: emailBad.created_at, text: short(emailBad.last_error) ?? "Send failed" } : null,
    limits: "Escalation alerts only. Failed sends retry with backoff, then stop; admins can retry them here.",
  };

  const rows: EventRow[] = [
    ...ev.map((e) => ({ id: e.id, provider: e.provider as EventRow["provider"], label: e.event_type ?? "event", status: e.status, detail: short(e.detail), at: e.created_at, deliveries: e.deliveries })),
    ...ox.map((o) => ({ id: o.id, provider: "email" as const, label: `Alert (${o.kind})`, status: o.status, detail: short(o.last_error), at: o.sent_at ?? o.created_at, retryable: o.status === "failed" || o.status === "dead" })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);

  return { cards: [stripe, google, email], rows } as const;
}

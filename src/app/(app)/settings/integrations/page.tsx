import { Chip, Notice, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { formatWhen } from "@/features/crm/format";
import { appUrl } from "@/lib/app-url";
import { loadIntegrations, type ProviderCard } from "@/features/integrations/server/status";
import { RetryButton } from "@/features/integrations/components/retry-button";

export const metadata = { title: "Integrations · RelayHQ" };

const STATE: Record<ProviderCard["state"], { label: string; tone: "green" | "amber" | "slate" }> = {
  configured: { label: "Configured", tone: "green" },
  attention: { label: "Needs attention", tone: "amber" },
  not_configured: { label: "Not configured", tone: "slate" },
};
const ICON: Record<string, string> = { stripe: "S", google: "G", email: "E" };
const EVENT_TONE = (s: string): "green" | "amber" | "rose" | "slate" =>
  s === "processed" || s === "sent" ? "green" : s === "failed" || s === "dead" || s === "rejected" ? "rose" : s === "pending" || s === "leased" ? "amber" : "slate";

function webhookUrl() {
  try {
    return `${appUrl()}/api/webhooks/stripe`;
  } catch {
    return null;
  }
}

export default async function IntegrationsPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "integrations.manage")) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Integrations" subtitle="Connection health for Stripe, Google Calendar and email alerts." />
        <div className="card panel" role="alert"><h2>You don&apos;t have access to integrations</h2><p className="subline" style={{ marginTop: 8 }}>Ask a workspace admin for the integrations permission.</p></div>
      </>
    );
  }
  const data = await loadIntegrations(ctx);
  const tz = ctx.workspace.timezone;
  const hook = webhookUrl();

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Integrations" subtitle="Status, last success and last failure for each connection, read from real events. Secrets are never shown." />
      {"error" in data ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load integration status</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : (
        <>
          {data.cards.some((c) => c.state === "attention") && (
            <Notice icon="alert" tone="amber" title="A connection needs attention">See the last failure below. Failed alerts can be retried from the event log.</Notice>
          )}
          <div className="integration-grid">
            {data.cards.map((c) => (
              <section className="card integration-card" key={c.key} aria-labelledby={`int-${c.key}`}>
                <div className="integration-head">
                  <div className={`provider-icon ${c.key === "email" ? "resend" : c.key}`} aria-hidden="true">{ICON[c.key]}</div>
                  <div className="provider-info"><b id={`int-${c.key}`}>{c.name}</b><small>{c.limits}</small></div>
                </div>
                <div style={{ marginTop: 14 }}><Chip tone={STATE[c.state].tone}>{STATE[c.state].label}</Chip></div>
                <ul style={{ margin: "12px 0 0", paddingLeft: 18, fontSize: 12 }}>{c.facts.map((f) => <li key={f}>{f}</li>)}</ul>
                {c.key === "stripe" && (
                  <p className="member-secondary" style={{ marginTop: 10, wordBreak: "break-all" }}>
                    Webhook endpoint: {hook ? <code>{hook}</code> : "set APP_URL to see it"}
                  </p>
                )}
                <div className="integration-foot" style={{ flexDirection: "column", alignItems: "flex-start" }}>
                  <small>{c.lastSuccess ? `Last success · ${formatWhen(c.lastSuccess, tz)}` : "No successful event yet"}</small>
                  {c.lastError ? <small style={{ color: "var(--coral)" }}>Last failure · {formatWhen(c.lastError.at, tz)}: {c.lastError.text}</small> : <small>No failures recorded</small>}
                </div>
              </section>
            ))}
          </div>

          <div className="card panel event-table" style={{ marginTop: 19 }}>
            <div className="panel-header"><div><h2>Event log</h2><div className="panel-label">Provider events and outgoing alerts for this workspace</div></div></div>
            {data.rows.length === 0 ? (
              <p className="subline" style={{ padding: "12px 0" }}>No events yet. They appear here as Stripe confirms payments and alerts are sent.</p>
            ) : (
              <div className="table-viewport">
                <table className="data-table">
                  <caption className="sr-only">Recent integration events</caption>
                  <thead><tr><th scope="col">When</th><th scope="col">Provider</th><th scope="col">Event</th><th scope="col">Result</th><th scope="col">Detail</th><th scope="col"><span className="sr-only">Actions</span></th></tr></thead>
                  <tbody>
                    {data.rows.map((r) => (
                      <tr key={`${r.provider}-${r.id}`}>
                        <td>{formatWhen(r.at, tz)}</td>
                        <td>{r.provider === "email" ? "Email" : r.provider === "stripe" ? "Stripe" : "Google"}</td>
                        <td><span className="event-id">{r.label}</span>{r.deliveries && r.deliveries > 1 ? <> · {r.deliveries} deliveries</> : null}</td>
                        <td><Chip tone={EVENT_TONE(r.status)}>{r.status}</Chip></td>
                        <td>{r.detail ?? "—"}</td>
                        <td>{r.retryable ? <RetryButton eventId={r.id} label={`Retry ${r.label} from ${formatWhen(r.at, tz)}`} /> : null}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}

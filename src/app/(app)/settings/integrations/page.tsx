import Link from "next/link";
import { Chip, Notice, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { formatWhen } from "@/features/crm/format";
import { loadIntegrations } from "@/features/integrations/server/status";

export const metadata = { title: "Integrations · RelayHQ" };

const LETTER: Record<string, [string, string]> = { stripe: ["S", "stripe"], google: ["G", "google"], email: ["E", "resend"] };
const EV_TONE: Record<string, "green" | "amber" | "rose" | "slate"> = { processed: "green", ignored: "slate", rejected: "rose", failed: "rose", sent: "green", pending: "amber", leased: "amber", dead: "rose" };

export default async function IntegrationsPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "integrations.manage")) {
    return (<><PageHeader workspace={ctx.workspace.name} title="Integrations" subtitle="Provider connections and their event log." />
      <div className="card panel" role="alert"><h2>Workspace admins only</h2><p className="subline" style={{ marginTop: 8 }}>You need the integrations permission to see provider health.</p></div></>);
  }
  const data = await loadIntegrations(ctx);
  const tz = ctx.workspace.timezone;
  const healthy = data.providers.filter((p) => p.connected).length;
  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Integrations" subtitle="Every connection, its last successful call and any failure in one place. Health comes from real provider events, not configuration alone."
        actions={<Link className="btn primary" href="/appointments">Connect Google Calendar</Link>} />
      {data.error && <Notice icon="alert" tone="amber" title="Couldn&apos;t load the event log">{data.error.message}</Notice>}
      <Notice icon={healthy === 3 ? "check" : "alert"} tone={healthy === 3 ? "green" : "amber"} title={`${healthy} of 3 providers verified by a real event`} action={<Chip tone={healthy === 3 ? "green" : "amber"}>Live status</Chip>}>
        Stripe is verified by a signed webhook, Google by a completed OAuth consent, email by a delivered outbox message.
      </Notice>
      <div className="integration-grid">
        {data.providers.map((p) => (
          <div className="card integration-card" key={p.key}>
            <div className="integration-head">
              <div className={`provider-icon ${LETTER[p.key][1]}`}>{LETTER[p.key][0]}</div>
              <div className="provider-info"><b>{p.name}</b><small>{p.sub}</small></div>
            </div>
            <div style={{ marginTop: 18, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Chip tone={p.connected ? "green" : p.configured ? "amber" : "rose"}>{p.connected ? "Connected" : p.configured ? "Configured, no event yet" : "Not configured"}</Chip>
              {p.lastError && <Chip tone="rose">Last error</Chip>}
            </div>
            <div className="integration-foot">
              <small>{p.detail}{p.lastAt ? ` · last success ${formatWhen(p.lastAt, tz)}` : ""}</small>
              {p.key === "google" ? <Link className="btn small" href="/appointments">Manage</Link> : p.key === "stripe" ? <Link className="btn small" href="/payments">Manage</Link> : <Link className="btn small" href="/settings/profile">Manage</Link>}
            </div>
            {p.lastError && <p className="form-error" style={{ marginTop: 8 }}>{p.lastError}</p>}
          </div>
        ))}
      </div>

      <div className="card panel event-table" style={{ marginTop: 19 }}>
        <div className="panel-header">
          <div><h2>Provider events</h2><div className="panel-label">Signed webhooks received (deduplicated by provider event id)</div></div>
        </div>
        <div className="table-viewport">
          <table className="data-table">
            <thead><tr><th>Provider</th><th>Event</th><th>Reference</th><th>Received</th><th>Deliveries</th><th>Status</th></tr></thead>
            <tbody>
              {data.events.length === 0 && <tr><td colSpan={6} className="subline">No provider events yet. Complete a Stripe test payment to see the first one.</td></tr>}
              {data.events.map((e) => (
                <tr key={e.id}>
                  <td>{e.provider}</td><td>{e.event_type ?? "—"}{e.detail ? <small className="subline"> · {e.detail}</small> : null}</td>
                  <td><span className="event-id">{e.event_id ? `${e.event_id.slice(0, 8)}••••${e.event_id.slice(-4)}` : "rejected"}</span></td>
                  <td>{formatWhen(e.created_at, tz)}</td><td>{e.deliveries}</td>
                  <td><Chip tone={EV_TONE[e.status] ?? "slate"}>{e.status}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card panel event-table" style={{ marginTop: 19 }}>
        <div className="panel-header">
          <div><h2>Outbound alerts (email outbox)</h2><div className="panel-label">Queued in the same transaction as the escalation; retried with backoff; failures stay visible</div></div>
        </div>
        <div className="table-viewport">
          <table className="data-table">
            <thead><tr><th>Kind</th><th>Queued</th><th>Attempts</th><th>Status</th><th>Sent</th><th>Last error</th></tr></thead>
            <tbody>
              {data.outbox.length === 0 && <tr><td colSpan={6} className="subline">No alerts queued yet. An escalation queues the first one.</td></tr>}
              {data.outbox.map((o) => (
                <tr key={o.id}>
                  <td>{o.kind}</td><td>{formatWhen(o.created_at, tz)}</td><td>{o.attempts}</td>
                  <td><Chip tone={EV_TONE[o.status] ?? "slate"}>{o.status}</Chip></td>
                  <td>{o.sent_at ? formatWhen(o.sent_at, tz) : "—"}</td><td className="subline">{o.last_error ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

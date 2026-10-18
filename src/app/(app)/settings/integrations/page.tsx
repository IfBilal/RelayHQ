import { Chip, Notice, PageHeader, PendingButton } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";
import { integrations, syncEvents } from "@/features/_sample/data";

export const metadata = { title: "Integrations · RelayHQ" };

export default async function IntegrationsPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote>SAMPLE DATA · No provider is connected yet; these states are illustrative</SampleNote>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Integrations"
        subtitle="Every connection, its last successful sync and any failure in one place."
        actions={
          <>
            <PendingButton note="Sync history arrives with the integration control center.">Sync history</PendingButton>
            <PendingButton style="primary" note="Connections are workspace-admin only and arrive with each provider module.">
              <Icon name="plus" /> Add connection
            </PendingButton>
          </>
        }
      />
      <Notice icon="check" tone="green" title="4 provider integrations shown in this sample view" action={<Chip tone="green">Sample states</Chip>}>
        Real provider health is determined from verified API calls and provider events.
      </Notice>

      <div className="integration-grid">
        {integrations.map((p) => (
          <div className="card integration-card" key={p.name}>
            <div className="integration-head">
              <div className={`provider-icon ${p.cls}`}>{p.letter}</div>
              <div className="provider-info">
                <b>{p.name}</b>
                <small>{p.sub}</small>
              </div>
            </div>
            <div style={{ marginTop: 18 }}>
              <Chip tone="green">Connected</Chip>
            </div>
            <div className="integration-foot">
              <small>{p.last}</small>
              <PendingButton style="small" note="Credentials and events never reach the browser; management arrives with the provider module.">Manage</PendingButton>
            </div>
          </div>
        ))}
      </div>

      <div className="card panel event-table" style={{ marginTop: 19 }}>
        <div className="panel-header">
          <div>
            <h2>Recent synchronization events</h2>
            <div className="panel-label">Incoming and outgoing provider calls are traced</div>
          </div>
          <PendingButton style="small" note="Filters arrive with the sync history.">
            <Icon name="filter" /> Filters
          </PendingButton>
        </div>
        <div className="table-viewport">
          <table className="data-table">
            <thead>
              <tr><th>Provider</th><th>Event</th><th>Reference</th><th>Received</th><th>Status</th></tr>
            </thead>
            <tbody>
              {syncEvents.map((e) => (
                <tr key={e.ref}>
                  <td>{e.provider}</td>
                  <td>{e.event}</td>
                  <td><span className="event-id">{e.ref}</span></td>
                  <td>{e.at}</td>
                  <td><Chip tone="green">{e.status}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

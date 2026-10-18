import { Avatar, Chip, LinkButton, Notice, PageHeader, PendingButton, Segmented, Timeline } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";
import { recoveryLeads } from "@/features/_sample/data";

export const metadata = { title: "Recovery queue · RelayHQ" };

export default async function RecoveryPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote />
      <PageHeader
        workspace={ctx.workspace.name}
        title="Recovery queue"
        subtitle="Intervene before a slow reply turns into a lost customer."
        actions={
          <>
            <PendingButton note="Filters arrive with the lead list API.">
              <Icon name="filter" /> Filters
            </PendingButton>
            <PendingButton style="primary" note="Manual lead capture arrives with the lead engine.">
              <Icon name="plus" /> New lead
            </PendingButton>
          </>
        }
      />

      <Notice
        title="2 leads are past their response deadline"
        action={
          <a className="btn small" href="#recovery-table">
            Review urgent
          </a>
        }
      >
        Lead ownership remains active. Escalations run automatically, even when staff are offline.
      </Notice>

      <div className="card stat-strip">
        <div className="stat-item"><strong>04</strong><small>Needs attention</small></div>
        <div className="stat-rule" />
        <div className="stat-item"><strong style={{ color: "#b7534d" }}>02</strong><small>Past deadline</small></div>
        <div className="stat-rule" />
        <div className="stat-item"><strong>03</strong><small>Escalated today</small></div>
        <div className="stat-rule" />
        <div className="stat-item"><strong>94%</strong><small>Protected within SLA</small></div>
      </div>

      <div className="controls">
        <div className="inline-actions">
          <div className="search-input">
            <Icon name="search" /> Search leads...
          </div>
          <Segmented tabs options={["All (4)", "Overdue (2)", "Escalated"]} />
        </div>
        <PendingButton note="More filters arrive with saved views.">
          <Icon name="filter" /> More filters
        </PendingButton>
      </div>

      <div className="card table-panel" id="recovery-table">
        <div className="table-viewport">
          <table className="data-table">
            <thead>
              <tr>
                <th>Lead / request</th>
                <th>Source</th>
                <th>Current owner</th>
                <th>Response timer</th>
                <th>Reason</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recoveryLeads.map((d, i) => (
                <tr key={d.name}>
                  <td>
                    <div className="lead-name">
                      <b>{d.name}</b>
                      <small>{d.request}</small>
                    </div>
                  </td>
                  <td><span className="tag-mini">{d.source}</span></td>
                  <td>
                    <div className="row-person">
                      <Avatar name={d.owner} tone="warm" />
                      <span>{d.owner}</span>
                    </div>
                  </td>
                  <td><span className={`sla ${d.tone === "amber" ? "warn" : ""}`}>{d.timer}</span></td>
                  <td><Chip tone={d.tone}>{d.reason}</Chip></td>
                  <td>
                    {i === 0 ? (
                      <PendingButton style="small" note="Reassignment arrives with the lead engine.">Reassign</PendingButton>
                    ) : (
                      <LinkButton href="/contacts/sample" style="small">View lead</LinkButton>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="queue-recent" style={{ marginTop: 18 }}>
        <div className="card panel">
          <div className="panel-header">
            <div>
              <h2>What happens next</h2>
              <div className="panel-label">Automatic response protection rules</div>
            </div>
            <LinkButton href="/settings/assignment" style="small">View routing rules</LinkButton>
          </div>
          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", justifyContent: "space-between", alignItems: "center" }}>
            <div><div className="label-kpi">Primary owner</div><b style={{ fontSize: 17, color: "#24464b" }}>Available rep</b></div>
            <Icon name="arrow" large />
            <div><div className="label-kpi">After deadline</div><b style={{ fontSize: 17, color: "#24464b" }}>Backup rep</b></div>
            <Icon name="arrow" large />
            <div><div className="label-kpi">Continued delay</div><b style={{ fontSize: 17, color: "#24464b" }}>Manager + alert</b></div>
          </div>
          <p className="prompt">The database owns every deadline. Reloads and concurrent checks cannot create a second owner.</p>
        </div>
        <div className="card railcard">
          <h2>Latest rescue activity</h2>
          <Timeline
            entries={[
              { title: "Maya Richardson escalated", body: "Owner changed from Daniel to Olivia", meta: "2 minutes ago · System", urgent: true },
              { title: "James Walker assigned", body: "Routed to Daniel, available status", meta: "7 minutes ago · System" },
            ]}
          />
        </div>
      </div>
    </>
  );
}

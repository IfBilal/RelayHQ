import { Avatar, Chip, Notice, PageHeader, PendingButton } from "@/components/relay/kit";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";
import { ladder, routingPreview } from "@/features/_sample/data";

export const metadata = { title: "Assignment rules · RelayHQ" };

function Select({ label, value, help }: { label: string; value: string; help?: string }) {
  return (
    <div>
      <span className="formlabel">{label}</span>
      <div className="fake-select">
        {value} <span aria-hidden="true">⌄</span>
      </div>
      {help && <div className="helptext">{help}</div>}
    </div>
  );
}

export default async function AssignmentPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote>SAMPLE DATA · Rules are not editable until the lead engine ships</SampleNote>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Assignment rules"
        subtitle="Customize the routing system that keeps every lead accountable."
        actions={
          <>
            <PendingButton note="The audit log is read-only and permission gated; arrives with the audit module.">View audit</PendingButton>
            <PendingButton style="primary" note="Rules are validated and saved atomically once the lead engine ships.">Save changes</PendingButton>
          </>
        }
      />
      <Notice icon="check" tone="green" title="Protection enabled for all inbound leads" action={<Chip tone="green">Active</Chip>}>
        Routing uses employee availability, workload limits and escalating deadlines.
      </Notice>

      <div className="rules-grid">
        <div className="card rule-form">
          <div className="block-heading">
            <h2>Default assignment policy</h2>
            <Chip tone="slate">Workspace default</Chip>
          </div>
          <div className="formrow">
            <Select label="Distribution method" value="Round robin" help="Rotate evenly among available team members." />
            <Select label="Open leads per employee" value="Maximum 8 leads" help="Busy, on leave and offline are excluded." />
          </div>
          <div className="formrow">
            <Select label="First response deadline" value="30 seconds (demo)" />
            <Select label="No-response action" value="Escalate automatically" />
          </div>
          <div className="rule-line" />
          <div className="block-heading">
            <h2>Escalation ladder</h2>
            <span className="label-kpi">All timeouts configurable</span>
          </div>
          <div className="ladder">
            {ladder.map((s) => (
              <div className="step" key={s.n}>
                <span className="step-num">{s.n}</span>
                <b>{s.title}</b>
                <p>{s.body}</p>
                <div className="step-chips">
                  {s.chips.map(([label, tone]) => (
                    <Chip key={label} tone={tone}>{label}</Chip>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div className="rule-line" />
          <div className="switch-row">
            <div>
              <b style={{ fontSize: 12, color: "#29444b" }}>Reassign unacknowledged leads on absence</b>
              <div className="helptext">Already acknowledged leads remain owned until manually reassigned.</div>
            </div>
            <div className="switch" role="switch" aria-checked="true" aria-label="Reassign unacknowledged leads on absence" />
          </div>
        </div>

        <div>
          <div className="card panel">
            <h2>Assignment preview</h2>
            <p className="subline" style={{ marginTop: 8 }}>Illustrative path for the next inbound web lead.</p>
            <div className="ghost-divider" />
            {routingPreview.map((m) => (
              <div className="member" style={{ marginBottom: 17 }} key={m.name}>
                <Avatar name={m.name} tone={m.avatar} />
                <div className="member-main">
                  <div className="member-name">{m.name}</div>
                  <div className="member-secondary">{m.sub}</div>
                </div>
                <Chip tone={m.tone}>{m.chip}</Chip>
              </div>
            ))}
          </div>
          <div className="aside-info">
            <b>Designed for reliability</b>
            <p className="helptext">
              The browser displays countdowns, but ownership changes are decided transactionally by the Supabase database and Cron scheduler.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

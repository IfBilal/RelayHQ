import Link from "next/link";
import { Avatar, Chip, Metric, PageHeader, PendingButton, Segmented } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";
import { pipelineColumns } from "@/features/_sample/data";

export const metadata = { title: "Sales pipeline · RelayHQ" };

export default async function PipelinePage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote />
      <PageHeader
        workspace={ctx.workspace.name}
        title="Sales pipeline"
        subtitle="A clear view of every opportunity, from first contact to close."
        actions={
          <>
            <PendingButton note="Saved views arrive with the CRM filters.">Save view</PendingButton>
            <PendingButton style="primary" note="Opportunity forms use pipeline-specific custom fields and arrive with the CRM module.">
              <Icon name="plus" /> New opportunity
            </PendingButton>
          </>
        }
      />
      <div className="grid4">
        <Metric title="Open pipeline" value="$94.4k" sub="5 active opportunities" icon="trend" />
        <Metric title="New inquiries" value="12" sub="8 web · 4 WhatsApp" icon="people" />
        <Metric title="Proposals pending" value="03" sub="Value visible to permitted users" icon="clock" />
        <Metric title="Close rate" value="31%" sub="This month" icon="home" />
      </div>

      <div className="controls">
        <div className="inline-actions">
          <Segmented tabs options={["Solar sales pipeline", "Maintenance pipeline ▾"]} />
          <PendingButton note="Filters arrive with the CRM module.">
            <Icon name="filter" /> Filters
          </PendingButton>
        </div>
        <span className="statline">Board view · move stages from each card’s menu or by keyboard</span>
      </div>

      <div className="board">
        {pipelineColumns.map((col) => (
          <section className="board-col" key={col.name} aria-label={col.name}>
            <div className="board-header">
              <div className="stage-left">
                <span className={`stage-dot ${col.dot}`} />
                {col.name} <Chip tone="slate">{col.deals.length}</Chip>
              </div>
              <span className="board-meta" aria-hidden="true">•••</span>
            </div>
            {col.deals.map((d) => (
              <Link href="/contacts/sample" className="deal-card" style={{ display: "block" }} key={d.company}>
                <div className="deal-title">{d.company}</div>
                <div className="deal-sub">{d.sub}</div>
                <div className="deal-value">{d.value}</div>
                <div className="deal-footer">
                  <span>
                    <Avatar name={d.rep} /> Assigned rep
                  </span>
                  <span>{d.progress > 80 ? "3" : "7"}d in stage</span>
                </div>
                <div className="progress-track">
                  <div className="progress-bar" style={{ width: `${d.progress}%` }} />
                </div>
              </Link>
            ))}
            <PendingButton note="Adding opportunities arrives with the CRM module.">+ Add opportunity</PendingButton>
          </section>
        ))}
      </div>
      <div className="app-footer-note">
        Sample opportunity values shown for the Owner view. Production enforces field-level value permission in Supabase and API responses.
      </div>
    </>
  );
}

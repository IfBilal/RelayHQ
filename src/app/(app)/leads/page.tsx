import Link from "next/link";
import { Chip, LinkButton, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { listLeads } from "@/features/leads/server/leads";
import { SOURCE_LABEL } from "@/features/leads/types";
import { Countdown } from "@/features/leads/components/countdown";
import { AcknowledgeButton } from "@/features/leads/components/lead-actions";
import { formatWhen } from "@/features/crm/format";
import { startOfLocalDay } from "@/features/identity/server/time";

export const metadata = { title: "Leads · RelayHQ" };

export default async function LeadsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = (await getSessionContext())!;
  const sp = await searchParams;
  if (!can(ctx, "lead.view")) {
    return (
      <div className="card panel" role="alert">
        <h2>You don&apos;t have access to leads</h2>
      </div>
    );
  }
  const manager = can(ctx, "lead.reassign");
  const today = sp.created === "today";
  const result = await listLeads(ctx, { status: today || sp.status === "all" ? "all" : "open", since: today ? startOfLocalDay(ctx.workspace.timezone) : undefined });
  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title={today ? "Leads received today" : manager ? "All open leads" : "My leads"}
        subtitle={manager ? "Every open lead in the workspace, with its accountable owner." : "Leads you own, most recent first. Acknowledge each one to stop its timer."}
        actions={can(ctx, "lead.create") && <LinkButton href="/leads/new" style="primary"><Icon name="plus" /> New lead</LinkButton>}
      />
      {result.error ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load leads</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : result.items.length === 0 ? (
        <div className="card panel">
          <h2>No open leads</h2>
          <p className="subline" style={{ margin: "8px 0 14px" }}>New leads from your web form or manual entry appear here the moment they arrive.</p>
          {can(ctx, "lead.create") && <LinkButton href="/leads/new" style="primary">Capture a lead</LinkButton>}
        </div>
      ) : (
        <div className="card table-panel">
          <div className="table-viewport">
            <table className="data-table">
              <thead><tr><th>Lead</th><th>Source</th><th>Owner</th><th>Response timer</th><th>Received</th><th>Action</th></tr></thead>
              <tbody>
                {result.items.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <div className="lead-name">
                        <Link href={`/leads/${l.id}`}><b>{l.contact_name}</b></Link>
                        <small>{l.summary || "No details provided"}</small>
                      </div>
                    </td>
                    <td><span className="tag-mini">{SOURCE_LABEL[l.source]}</span></td>
                    <td>{l.owner_name ?? "—"} {l.emergency && <Chip tone="rose">Emergency owner</Chip>}</td>
                    <td><Countdown deadlineAt={l.acknowledged_at ? null : l.deadline_at} /></td>
                    <td>{formatWhen(l.created_at, ctx.workspace.timezone)}</td>
                    <td>
                      {!l.acknowledged_at && l.owner_user_id === ctx.user.id ? <AcknowledgeButton leadId={l.id} version={l.version} /> : <LinkButton href={`/leads/${l.id}`} style="small">Open</LinkButton>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

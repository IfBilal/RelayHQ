import Link from "next/link";
import { Chip, LinkButton, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { listAudit } from "@/features/audit/server/audit";
import { teamOverview } from "@/features/leads/server/leads";
import { formatWhen } from "@/features/crm/format";

export const metadata = { title: "Audit log · RelayHQ" };

const EVENT_GROUPS = [
  ["lead.", "Leads (capture, acknowledge, escalation, reassignment)"],
  ["lead.escalated", "Automatic escalations"],
  ["member.", "Members and availability"],
  ["role.", "Role permissions"],
  ["assignment.", "Assignment rules"],
  ["pipeline.", "Pipelines"],
  ["stage.", "Stages"],
  ["field.", "Custom fields"],
  ["opportunity.", "Opportunities"],
  ["workspace.", "Workspace"],
] as const;

const LABEL: Record<string, string> = {
  "lead.captured": "Lead captured",
  "lead.acknowledged": "Lead acknowledged",
  "lead.escalated": "Lead escalated automatically",
  "lead.reassigned": "Lead reassigned manually",
  "lead.reassigned_absence": "Lead reassigned (owner unavailable)",
  "lead.closed": "Lead closed",
  "member.invited": "Member invited",
  "member.joined": "Member joined",
  "member.access_changed": "Member access changed",
  "member.availability_changed": "Availability changed",
  "role.permissions_changed": "Role permissions changed",
  "assignment.rules_changed": "Assignment rules changed",
  "pipeline.created": "Pipeline created",
  "stage.created": "Stage created",
  "stage.renamed": "Stage renamed",
  "stage.reordered": "Stages reordered",
  "stage.deleted": "Stage deleted",
  "stage.required_fields_changed": "Required stage fields changed",
  "field.created": "Custom field created",
  "field.archived": "Custom field archived",
  "opportunity.created": "Opportunity created",
  "opportunity.stage_changed": "Opportunity stage changed",
  "opportunity.value_changed": "Opportunity value changed",
  "workspace.created": "Workspace created",
};

type SP = Record<string, string | undefined>;

export default async function AuditPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "audit.view")) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Audit log" subtitle="Who did what, and when." />
        <div className="card panel" role="alert">
          <h2>You don&apos;t have access to the audit log</h2>
          <p className="subline" style={{ marginTop: 8 }}>Ask the workspace owner to grant you the audit permission.</p>
        </div>
      </>
    );
  }
  const sp = await searchParams;
  const [result, team] = await Promise.all([
    listAudit(ctx, {
      action: sp.action,
      actor: sp.actor,
      from: sp.from ? `${sp.from}T00:00:00Z` : undefined,
      to: sp.to ? new Date(Date.parse(`${sp.to}T00:00:00Z`) + 86_400_000).toISOString() : undefined,
      cursor: sp.cursor,
      limit: 50,
    }),
    teamOverview(ctx),
  ]);
  const members = team.error ? [] : team.items;
  const params = new URLSearchParams(Object.entries(sp).filter(([k, v]) => v && k !== "cursor") as [string, string][]);

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Audit log" subtitle="Every important action, who did it and when. Entries cannot be edited or deleted." />

      <form className="card panel" action="/audit" style={{ marginBottom: 18 }}>
        <div className="formrow" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", marginBottom: 12 }}>
          <div>
            <label className="formlabel" htmlFor="action">Event type</label>
            <select id="action" name="action" defaultValue={sp.action ?? ""} className="cal-input" style={{ width: "100%", margin: 0 }}>
              <option value="">All events</option>
              {EVENT_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div>
            <label className="formlabel" htmlFor="actor">Person</label>
            <select id="actor" name="actor" defaultValue={sp.actor ?? ""} className="cal-input" style={{ width: "100%", margin: 0 }}>
              <option value="">Anyone</option>
              <option value="system">System</option>
              {members.map((m) => <option key={m.user_id} value={m.user_id}>{m.display_name ?? "Member"}</option>)}
            </select>
          </div>
          <div>
            <label className="formlabel" htmlFor="from">From (UTC)</label>
            <input id="from" name="from" type="date" defaultValue={sp.from ?? ""} className="cal-input" style={{ width: "100%", margin: 0 }} />
          </div>
          <div>
            <label className="formlabel" htmlFor="to">To (UTC)</label>
            <input id="to" name="to" type="date" defaultValue={sp.to ?? ""} className="cal-input" style={{ width: "100%", margin: 0 }} />
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button type="submit" className="btn primary">Apply filters</button>
          {params.size > 0 && <LinkButton href="/audit">Clear</LinkButton>}
        </div>
      </form>

      {result.error ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load the audit log</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : result.items.length === 0 ? (
        <div className="card panel"><h2>No matching events</h2><p className="subline" style={{ marginTop: 8 }}>{params.size ? "Try widening the filters." : "Actions appear here as people use the workspace."}</p></div>
      ) : (
        <div className="card table-panel">
          <div className="table-viewport">
            <table className="data-table">
              <thead><tr><th>When</th><th>Who</th><th>Event</th><th>Target</th><th>Details</th></tr></thead>
              <tbody>
                {result.items.map((e) => (
                  <tr key={e.id}>
                    <td>{formatWhen(e.created_at, ctx.workspace.timezone)}</td>
                    <td>{e.actor_name ?? <Chip tone="slate">System</Chip>}</td>
                    <td><b>{LABEL[e.action] ?? e.action}</b></td>
                    <td><span className="event-id">{e.entity_type}{e.entity_id ? ` · ${e.entity_id.slice(0, 8)}` : ""}</span></td>
                    <td>
                      {e.before || e.after ? (
                        <details>
                          <summary style={{ cursor: "pointer", fontSize: 11 }}>Before and after</summary>
                          <pre style={{ fontSize: 10, whiteSpace: "pre-wrap", maxWidth: 360 }}>{JSON.stringify({ before: e.before, after: e.after }, null, 2)}</pre>
                        </details>
                      ) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {result.nextCursor && (
            <div style={{ padding: "14px 0", textAlign: "center" }}>
              <Link href={`/audit?${new URLSearchParams({ ...Object.fromEntries(params), cursor: result.nextCursor }).toString()}`} className="btn">Older events</Link>
            </div>
          )}
        </div>
      )}
    </>
  );
}

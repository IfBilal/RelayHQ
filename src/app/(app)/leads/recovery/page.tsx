import Link from "next/link";
import { Avatar, Chip, LinkButton, Notice, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { recoveryQueue, teamOverview } from "@/features/leads/server/leads";
import { REASON_LABEL } from "@/features/leads/schemas";
import { SOURCE_LABEL } from "@/features/leads/types";
import { Countdown } from "@/features/leads/components/countdown";
import { AcknowledgeButton, ReassignControl } from "@/features/leads/components/lead-actions";

export const metadata = { title: "Recovery queue · RelayHQ" };

export default async function RecoveryPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "lead.view")) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Recovery queue" subtitle="Intervene before a slow reply turns into a lost customer." />
        <div className="card panel" role="alert">
          <h2>You don&apos;t have access to leads</h2>
          <p className="subline" style={{ marginTop: 8 }}>Ask a workspace admin to grant you the lead view permission.</p>
        </div>
      </>
    );
  }

  const [queue, team] = await Promise.all([recoveryQueue(ctx), can(ctx, "lead.reassign") ? teamOverview(ctx) : Promise.resolve(null)]);
  const members = team && !team.error ? team.items.filter((m) => m.availability !== "offline" || true).map((m) => ({ id: m.user_id, name: m.display_name ?? "Team member" })) : [];
  const items = queue.error ? [] : queue.items;
  const pastDue = items.filter((i) => i.reasons.includes("PAST_DUE_UNACKNOWLEDGED")).length;
  const escalated = items.filter((i) => i.escalation_count > 0).length;

  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Recovery queue"
        subtitle="Intervene before a slow reply turns into a lost customer."
        actions={
          can(ctx, "lead.create") && (
            <LinkButton href="/leads/new" style="primary">
              <Icon name="plus" /> New lead
            </LinkButton>
          )
        }
      />

      {queue.error ? (
        <div className="card panel" role="alert">
          <h2>We couldn&apos;t load the recovery queue</h2>
          <p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p>
        </div>
      ) : items.length === 0 ? (
        <div className="card panel">
          <h2>Nothing needs rescuing</h2>
          <p className="subline" style={{ margin: "8px 0 14px" }}>
            Every open lead has an owner who is inside their response window. Leads appear here when they are overdue, escalated twice, idle or have no available owner.
          </p>
          <LinkButton href="/leads">See open leads</LinkButton>
        </div>
      ) : (
        <>
          {pastDue > 0 && (
            <Notice title={`${pastDue} ${pastDue === 1 ? "lead is" : "leads are"} past the response deadline`} action={<a className="btn small" href="#recovery-table">Review urgent</a>}>
              Lead ownership remains active. Escalations run automatically, even when staff are offline.
            </Notice>
          )}
          <div className="card stat-strip">
            <div className="stat-item"><strong>{String(items.length).padStart(2, "0")}</strong><small>Needs attention</small></div>
            <div className="stat-rule" />
            <div className="stat-item"><strong style={{ color: pastDue ? "#b7534d" : undefined }}>{String(pastDue).padStart(2, "0")}</strong><small>Past deadline</small></div>
            <div className="stat-rule" />
            <div className="stat-item"><strong>{String(escalated).padStart(2, "0")}</strong><small>Escalated at least once</small></div>
          </div>

          <div className="card table-panel" id="recovery-table">
            <div className="table-viewport">
              <table className="data-table">
                <thead>
                  <tr><th>Lead / request</th><th>Source</th><th>Current owner</th><th>Response timer</th><th>Reason</th><th>Action</th></tr>
                </thead>
                <tbody>
                  {items.map((d) => {
                    const mine = d.owner_user_id === ctx.user.id;
                    const awaiting = d.reasons.includes("PAST_DUE_UNACKNOWLEDGED") || d.deadline_at !== null;
                    return (
                      <tr key={d.lead_id}>
                        <td>
                          <div className="lead-name">
                            <Link href={`/leads/${d.lead_id}`}><b>{d.contact_name}</b></Link>
                            <small>{d.summary || "No details provided"}</small>
                          </div>
                        </td>
                        <td><span className="tag-mini">{SOURCE_LABEL[d.source]}</span></td>
                        <td>
                          <div className="row-person">
                            <Avatar name={d.owner_name ?? "?"} tone="warm" />
                            <span>{d.owner_name ?? "Unknown"}</span>
                          </div>
                        </td>
                        <td><Countdown deadlineAt={d.deadline_at} /></td>
                        <td>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {d.reasons.map((r) => (
                              <Chip key={r} tone={r === "PAST_DUE_UNACKNOWLEDGED" || r === "NO_ELIGIBLE_EMPLOYEE" || r === "FAILED_EXTERNAL_ALERT" ? "rose" : "amber"}>
                                {REASON_LABEL[r] ?? r}
                              </Chip>
                            ))}
                          </div>
                        </td>
                        <td>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-start" }}>
                            {awaiting && (mine || can(ctx, "lead.reassign")) && <AcknowledgeButton leadId={d.lead_id} version={d.version} />}
                            {can(ctx, "lead.reassign") && <ReassignControl leadId={d.lead_id} version={d.version} currentOwner={d.owner_user_id} members={members} />}
                            <LinkButton href={`/leads/${d.lead_id}`} style="small">View lead</LinkButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </>
  );
}

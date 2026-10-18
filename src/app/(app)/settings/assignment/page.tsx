import { Avatar, Chip, Notice, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { getRules, teamOverview } from "@/features/leads/server/leads";
import { RulesForm } from "@/features/leads/components/rules-form";
import { AvailabilitySelect } from "@/features/leads/components/availability-select";
import { formatWhen } from "@/features/crm/format";

export const metadata = { title: "Assignment rules · RelayHQ" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "slate" }> = {
  available: { label: "Available", tone: "green" },
  busy: { label: "Busy", tone: "amber" },
  on_leave: { label: "On leave", tone: "slate" },
  offline: { label: "Offline", tone: "slate" },
};

export default async function AssignmentPage() {
  const ctx = (await getSessionContext())!;
  const [rules, team] = await Promise.all([getRules(ctx), teamOverview(ctx)]);
  const members = team.error ? [] : team.items;
  const canEdit = can(ctx, "assignment.manage");

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Assignment rules" subtitle="Customize the routing system that keeps every lead accountable." />
      {!rules ? (
        <div className="card panel" role="alert"><h2>No assignment rules found</h2></div>
      ) : (
        <>
          <Notice icon="check" tone="green" title="Protection enabled for all inbound leads" action={<Chip tone="green">Active</Chip>}>
            Routing uses employee availability, workload limits and escalating deadlines. Last changed {formatWhen(rules.updated_at, ctx.workspace.timezone)}.
          </Notice>
          <div className="rules-grid">
            <RulesForm rules={rules} members={members.map((m) => ({ id: m.user_id, name: m.display_name ?? "Team member" }))} canEdit={canEdit} />
            <div>
              <div className="card panel">
                <h2>Team availability</h2>
                <p className="subline" style={{ marginTop: 8 }}>Only Available employees under the open-lead limit receive new leads.</p>
                <div className="ghost-divider" />
                {members.map((m) => {
                  const full = m.open_leads >= rules.max_open_leads;
                  const s = STATUS[m.availability];
                  return (
                    <div className="member" style={{ marginBottom: 17 }} key={m.user_id}>
                      <Avatar name={m.display_name ?? "?"} />
                      <div className="member-main">
                        <div className="member-name">{m.display_name ?? "Team member"}</div>
                        <div className="member-secondary">{m.open_leads}/{rules.max_open_leads} open{full ? " · at limit" : ""}</div>
                      </div>
                      {canEdit ? <AvailabilitySelect value={m.availability} userId={m.user_id} label={`Status for ${m.display_name ?? "member"}`} /> : <Chip tone={s.tone}>{s.label}</Chip>}
                    </div>
                  );
                })}
              </div>
              <div className="aside-info">
                <b>Designed for reliability</b>
                <p className="helptext">The browser displays countdowns, but ownership changes are decided transactionally by the Supabase database and its Cron scheduler.</p>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}

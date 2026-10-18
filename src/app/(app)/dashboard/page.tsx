import Link from "next/link";
import { Avatar, Chip, LinkButton, Metric, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { greeting } from "@/features/identity/server/greeting";
import { getHiddenWidgets, getOpenPipelineValue, getOverview } from "@/features/reporting/server/overview";
import { CustomizeDashboard } from "@/features/reporting/components/customize";
import type { WidgetKey } from "@/features/reporting/types";
import { recoveryQueue, teamOverview } from "@/features/leads/server/leads";
import { REASON_LABEL } from "@/features/leads/schemas";
import { Countdown } from "@/features/leads/components/countdown";
import { formatCompactMoney } from "@/features/crm/format";
import { collectedThisMonth } from "@/features/payments/server/payments";

export const metadata = { title: "Overview · RelayHQ" };

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" });

function duration(seconds: number | null) {
  if (seconds === null) return "—";
  const s = Math.round(seconds);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export default async function DashboardPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "dashboard.view")) {
    return <div className="card panel" role="alert"><h2>You don&apos;t have access to the dashboard</h2></div>;
  }
  const [overviewResult, hidden, openValue, queue, team, collected] = await Promise.all([
    getOverview(ctx),
    getHiddenWidgets(ctx),
    getOpenPipelineValue(ctx),
    can(ctx, "lead.view") ? recoveryQueue(ctx) : Promise.resolve(null),
    teamOverview(ctx),
    collectedThisMonth(ctx),
  ]);
  if (overviewResult.error) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Overview" subtitle="Here’s what needs attention across your business today." />
        <div className="card panel" role="alert"><h2>We couldn&apos;t load the dashboard</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      </>
    );
  }
  const o = overviewResult.overview;
  const company = o.scope === "company";
  const attention = queue && !queue.error ? queue.items : [];
  const members = team.error ? [] : team.items;
  const canValue = can(ctx, "opportunity.value.view");
  const show = (k: WidgetKey) => !hidden.includes(k);

  const available: WidgetKey[] = ["newLeads", "recovery", "response", ...(canValue ? (["collected"] as WidgetKey[]) : []), "escalations", "staff", "performance", "team", "attention", "agenda"];
  const first = ctx.user.displayName.split(/[\s@]/)[0];

  // response performance: percentage answered inside the first response window, per day with leads
  const points = o.responseSeries.map((d, i) => ({ i, pct: d.total ? (d.withinSla / d.total) * 100 : null, d }));
  const withData = points.filter((p) => p.pct !== null);
  const x = (i: number) => 5 + (i / 6) * 642;
  const y = (pct: number) => 150 - (pct / 100) * 135;
  const path = withData.map((p, k) => `${k ? "L" : "M"}${x(p.i).toFixed(1)} ${y(p.pct!).toFixed(1)}`).join(" ");
  const todayPct = withData.length ? Math.round(withData[withData.length - 1].pct!) : null;

  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title={`${greeting(ctx.workspace.timezone)}, ${first}.`}
        subtitle={company ? "Here’s what needs attention across your business today." : "Here’s what needs your attention today."}
        actions={
          <>
            <CustomizeDashboard hidden={hidden} available={available} />
            {can(ctx, "lead.create") && <LinkButton href="/leads/new" style="primary"><Icon name="plus" /> Add lead</LinkButton>}
          </>
        }
      />

      <div className="hero">
        <div className="hero-content">
          <div className="hero-tag"><span /> LEAD PROTECTION ACTIVE</div>
          <h2>{o.recoveryCount === 0 ? "Every lead has an owner and is being handled." : "Some leads need you now."}</h2>
          <p>
            {o.recoveryCount === 0
              ? "Nothing is overdue. Escalations run automatically if a response window passes."
              : `${o.recoveryCount} ${o.recoveryCount === 1 ? "lead needs" : "leads need"} attention. Review them before they become missed revenue.`}
          </p>
        </div>
        <div className="hero-side">
          <div className="hero-number">{String(o.recoveryCount).padStart(2, "0")}<small>{o.recoveryCount === 1 ? "lead needs attention" : "leads need attention"}</small></div>
          <LinkButton href="/leads/recovery" style="hero-action">Open recovery queue <Icon name="arrow" /></LinkButton>
        </div>
      </div>

      <div className="grid4">
        {show("newLeads") && <Metric title={company ? "New leads today" : "My new leads today"} value={String(o.newLeadsToday)} sub={`${o.openLeads} open ${company ? "in the workspace" : "assigned to you"}`} icon="people" href="/leads?created=today" />}
        {show("recovery") && <Metric title="Needs recovery" value={String(o.recoveryCount).padStart(2, "0")} sub={o.recoveryCount ? <span className="trend-bad">Review now</span> : "Nothing overdue"} icon="life" href="/leads/recovery" />}
        {show("response") && <Metric title="Avg. first response" value={duration(o.averageFirstResponseSeconds)} sub="Assignment to acknowledgement, last 7 days" icon="clock" href="/leads?status=all" />}
        {canValue && show("collected") && <Metric title="Collected this month" value={collected ? formatCompactMoney(collected.minor, collected.currency) : "—"} sub={collected && collected.count > 0 ? `${collected.count} Stripe-confirmed ${collected.count === 1 ? "payment" : "payments"}, net of refunds` : "No Stripe-confirmed payments this month"} icon="trend" href="/payments" />}
        {show("escalations") && can(ctx, "audit.view") ? <Metric title="Escalations (24h)" value={String(o.escalations24h).padStart(2, "0")} sub="Automatic only; manual reassignments excluded" icon="alert" href="/audit?action=lead.escalated" /> : show("escalations") && <Metric title="Escalations (24h)" value={String(o.escalations24h).padStart(2, "0")} sub="Automatic only" icon="alert" />}
        {show("staff") && <Metric title="Available staff" value={`${o.availableStaff}/${o.teamSize}`} sub="Available and under the open-lead limit" icon="people" href="/settings/assignment" />}
        {openValue !== null && <Metric title="Open pipeline" value={formatCompactMoney(openValue, "USD")} sub="Open opportunities, by stage" icon="trend" href="/pipelines/default" />}
      </div>

      <div className="dashboard-mid">
        {show("performance") && (
          <div className="card panel">
            <div className="panel-header">
              <div><h2>Lead response performance</h2><div className="panel-label">Answered inside the first {o.firstWindowSeconds}-second window, last 7 days</div></div>
            </div>
            {withData.length === 0 ? (
              <p className="subline">No leads in the last 7 days yet. The chart fills in as leads arrive and are acknowledged.</p>
            ) : (
              <>
                <svg className="trend-chart" viewBox="0 0 650 170" preserveAspectRatio="none" role="img" aria-label={`Percentage of leads answered inside the first response window, per day. Most recent day ${todayPct}%.`}>
                  <path d="M0 148H650M0 110H650M0 72H650M0 34H650" stroke="#EDF2EF" fill="none" />
                  <path d={path} stroke="#248675" strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  {withData.map((p) => <circle key={p.i} cx={x(p.i)} cy={y(p.pct!)} r="4" fill="white" stroke="#248675" strokeWidth="3" />)}
                </svg>
                <div className="chart-labels">{o.responseSeries.map((d) => <span key={d.day}>{DAY.format(new Date(d.day + "T00:00:00Z")).toUpperCase()}</span>)}</div>
                <div className="chart-footer">
                  <span className="legend"><span className="legend-dot" /> Responded within SLA</span>
                  <span>Latest day <strong>{todayPct}%</strong></span>
                </div>
              </>
            )}
          </div>
        )}
        {show("team") && (
          <div className="card panel">
            <div className="panel-header">
              <div><h2>Team availability</h2><div className="panel-label">Routing eligibility right now</div></div>
              <LinkButton href="/settings/assignment" style="small">Manage</LinkButton>
            </div>
            <div className="team-list">
              {members.map((m) => (
                <div className="member" key={m.user_id}>
                  <Avatar name={m.display_name ?? "?"} />
                  <div className="member-main">
                    <div className="member-name">{m.display_name ?? "Team member"}</div>
                    <div className="member-secondary">{m.open_leads} open {m.open_leads === 1 ? "lead" : "leads"}</div>
                  </div>
                  <Chip tone={m.availability === "available" ? "green" : m.availability === "busy" ? "amber" : "slate"}>
                    {{ available: "Available", busy: "Busy", on_leave: "On leave", offline: "Offline" }[m.availability]}
                  </Chip>
                </div>
              ))}
            </div>
            <div className="ghost-divider" />
            <div className="cruise">
              <b>{o.recoveryCount === 0 ? "All assigned. Nothing unowned." : "Some leads are waiting."}</b>
              <p>New leads route only to available employees under the limit, with the workspace owner as the last resort.</p>
            </div>
          </div>
        )}
      </div>

      <div className="dashboard-bottom">
        {show("attention") && (
          <div className="card panel">
            <div className="panel-header">
              <div><h2>Attention required</h2><div className="panel-label">Prioritized by urgency, not account size</div></div>
              <LinkButton href="/leads/recovery" style="small">View all <Icon name="arrow" /></LinkButton>
            </div>
            {attention.length === 0 ? (
              <p className="subline">Nothing needs attention right now.</p>
            ) : (
              <table className="compact-table">
                <thead><tr><th>Lead</th><th>Owner</th><th>Status</th><th>Action</th></tr></thead>
                <tbody>
                  {attention.slice(0, 4).map((r) => (
                    <tr key={r.lead_id}>
                      <td><div className="table-primary">{r.contact_name}</div><div className="table-sub">{REASON_LABEL[r.reasons[0]] ?? r.summary}</div></td>
                      <td>{r.owner_name ?? "—"}</td>
                      <td><Chip tone="rose"><Countdown deadlineAt={r.deadline_at} tone="plain" /></Chip></td>
                      <td><Link href={`/leads/${r.lead_id}`} className="btn small">Review</Link></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        {show("agenda") && (
          <div className="card panel">
            <div className="panel-header">
              <div><h2>Coming up today</h2><div className="panel-label">Google Calendar appointments</div></div>
              <LinkButton href="/appointments" style="small">Calendar</LinkButton>
            </div>
            <p className="subline">No appointments yet. Connect Google Calendar to book and see meetings here.</p>
          </div>
        )}
      </div>
    </>
  );
}

import { Avatar, Chip, LinkButton, Metric, PageHeader, PendingButton, Segmented } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";
import { greeting } from "@/features/identity/server/greeting";
import { agenda, recoveryLeads, team } from "@/features/_sample/data";

export const metadata = { title: "Overview · RelayHQ" };

export default async function DashboardPage() {
  const ctx = (await getSessionContext())!;
  const first = ctx.user.displayName.split(/[\s@]/)[0];
  const attention = recoveryLeads.length;

  return (
    <>
      <SampleNote />
      <PageHeader
        workspace={ctx.workspace.name}
        title={`${greeting(ctx.workspace.timezone)}, ${first}.`}
        subtitle="Here’s what needs attention across your business today."
        actions={
          <>
            <PendingButton note="Date range filters arrive with the reporting service.">
              <Icon name="filter" /> Last 7 days
            </PendingButton>
            <LinkButton href="/leads/recovery" style="primary">
              <Icon name="plus" /> Add lead
            </LinkButton>
          </>
        }
      />

      <div className="hero">
        <div className="hero-content">
          <div className="hero-tag">
            <span /> LEAD PROTECTION ACTIVE
          </div>
          <h2>Your pipeline is moving. Keep every lead in motion.</h2>
          <p>
            {attention === 4 ? "Four" : attention} customer opportunities need your attention. Review overdue responses before they become missed revenue.
          </p>
        </div>
        <div className="hero-side">
          <div className="hero-number">
            {String(attention).padStart(2, "0")}
            <small>leads need attention</small>
          </div>
          <LinkButton href="/leads/recovery" style="hero-action">
            Open recovery queue <Icon name="arrow" />
          </LinkButton>
        </div>
      </div>

      <div className="grid4">
        <Metric title="New leads today" value="24" sub={<><span className="trend-good">↑ 12%</span> vs yesterday</>} icon="people" href="/leads/recovery" />
        <Metric title="Needs recovery" value="04" sub={<span className="trend-bad">2 overdue right now</span>} icon="life" href="/leads/recovery" />
        <Metric title="Avg. first response" value="3m 42s" sub={<><span className="trend-good">↓ 18%</span> faster this week</>} icon="clock" href="/leads/recovery" />
        <Metric title="Collected this month" value="$18.6k" sub="Provider-confirmed revenue" icon="trend" href="/pipelines/default" />
      </div>

      <div className="dashboard-mid">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <h2>Lead response performance</h2>
              <div className="panel-label">Acknowledgements throughout the week</div>
            </div>
            <Segmented options={["7 days", "30 days"]} />
          </div>
          <svg className="trend-chart" viewBox="0 0 650 170" preserveAspectRatio="none" role="img" aria-label="Lead response performance rising through this week">
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop stopColor="#79c2a8" stopOpacity=".21" />
                <stop offset="1" stopColor="#79c2a8" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 148H650M0 110H650M0 72H650M0 34H650" stroke="#EDF2EF" fill="none" />
            <path d="M5 136 C55 121 82 132 110 112S176 85 220 98S292 77 331 87S399 38 446 58S517 49 551 30S609 25 647 13V170H5Z" fill="url(#trendFill)" />
            <path d="M5 136 C55 121 82 132 110 112S176 85 220 98S292 77 331 87S399 38 446 58S517 49 551 30S609 25 647 13" stroke="#248675" strokeWidth="3" fill="none" strokeLinecap="round" />
            <circle cx="551" cy="30" r="5" fill="white" stroke="#248675" strokeWidth="3" />
          </svg>
          <div className="chart-labels">
            {["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map((d) => (
              <span key={d}>{d}</span>
            ))}
          </div>
          <div className="chart-footer">
            <span className="legend">
              <span className="legend-dot" /> Responded within SLA
            </span>
            <span>
              Weekly target <strong>90%</strong> · Current <strong>94%</strong>
            </span>
          </div>
        </div>

        <div className="card panel">
          <div className="panel-header">
            <div>
              <h2>Team availability</h2>
              <div className="panel-label">Routing eligibility right now</div>
            </div>
            <LinkButton href="/settings/assignment" style="small">
              Manage
            </LinkButton>
          </div>
          <div className="team-list">
            {team.map((m) => (
              <div className="member" key={m.name}>
                <Avatar name={m.name} tone={m.avatar} />
                <div className="member-main">
                  <div className="member-name">{m.name}</div>
                  <div className="member-secondary">{m.note}</div>
                </div>
                <Chip tone={m.tone}>{m.status}</Chip>
              </div>
            ))}
          </div>
          <div className="ghost-divider" />
          <div className="cruise">
            <b>All assigned. Nothing unowned.</b>
            <p>New leads route only to eligible team members, with manager fallback when needed.</p>
          </div>
        </div>
      </div>

      <div className="dashboard-bottom">
        <div className="card panel">
          <div className="panel-header">
            <div>
              <h2>Attention required</h2>
              <div className="panel-label">Prioritized by urgency, not account size</div>
            </div>
            <LinkButton href="/leads/recovery" style="small">
              View all <Icon name="arrow" />
            </LinkButton>
          </div>
          <table className="compact-table">
            <thead>
              <tr>
                <th>Lead</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {recoveryLeads.slice(0, 3).map((r) => (
                <tr key={r.name}>
                  <td>
                    <div className="table-primary">{r.name}</div>
                    <div className="table-sub">{r.request}</div>
                  </td>
                  <td>{r.owner}</td>
                  <td>
                    <Chip tone={r.tone}>{r.timer}</Chip>
                  </td>
                  <td>
                    <LinkButton href="/leads/recovery" style="small">
                      Review
                    </LinkButton>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card panel">
          <div className="panel-header">
            <div>
              <h2>Coming up today</h2>
              <div className="panel-label">Google Calendar appointments</div>
            </div>
            <LinkButton href="/appointments" style="small">
              Calendar
            </LinkButton>
          </div>
          <div className="side-agenda">
            {agenda.map((a) => (
              <div className="agenda-row" key={a.time}>
                <div className="agenda-time">{a.time}</div>
                <div className="agenda-bar" />
                <div className="agenda-text">
                  <b>{a.title}</b>
                  <small>{a.who}</small>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

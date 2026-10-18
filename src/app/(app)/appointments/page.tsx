import Link from "next/link";
import { Chip, Notice, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { loadAppointments } from "@/features/calendar/server/appointments";
import { BookingForm } from "@/features/calendar/components/booking-form";
import { AppointmentActions } from "@/features/calendar/components/appointment-actions";
import { DisconnectCalendar } from "@/features/calendar/components/connect-button";
import { isGoogleConfigured } from "@/features/calendar/server/google";

export const metadata = { title: "Appointments · RelayHQ" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "rose" | "slate" }> = {
  pending: { label: "Pending", tone: "amber" }, confirmed: { label: "On Google Calendar", tone: "green" },
  cancelled: { label: "Cancelled", tone: "slate" }, error: { label: "Provider error", tone: "rose" },
};

function startOfWeek(d: Date) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = (x.getUTCDay() + 6) % 7; // Monday = 0
  x.setUTCDate(x.getUTCDate() - day);
  return x;
}

export default async function AppointmentsPage({ searchParams }: { searchParams: Promise<{ week?: string; calendar?: string }> }) {
  const { week, calendar } = await searchParams;
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "appointment.view")) {
    return (<><PageHeader workspace={ctx.workspace.name} title="Appointments" subtitle="Customer meetings on connected Google calendars." />
      <div className="card panel" role="alert"><h2>You don&apos;t have access to appointments</h2></div></>);
  }
  const base = week && /^\d{4}-\d{2}-\d{2}$/.test(week) ? new Date(week + "T00:00:00Z") : new Date();
  const weekStart = startOfWeek(base);
  const data = await loadAppointments(ctx, weekStart);
  const tz = ctx.workspace.timezone;
  const fmtDay = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: tz });
  const fmtTime = new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
  const dayKey = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
  const prev = new Date(weekStart.getTime() - 7 * 86_400_000).toISOString().slice(0, 10);
  const next = new Date(weekStart.getTime() + 7 * 86_400_000).toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * 86_400_000));
  const canBook = can(ctx, "appointment.create");

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Appointments" subtitle="Plan customer meetings on your team’s connected Google calendars. Every booking checks Google FreeBusy first."
        actions={<>
          <Link className="btn" href={`/appointments?week=${prev}`}>‹ Prev</Link>
          <Link className="btn" href="/appointments">Today</Link>
          <Link className="btn" href={`/appointments?week=${next}`}>Next ›</Link>
        </>} />
      {calendar === "connected" && <Notice icon="check" tone="green" title="Google Calendar connected">Your bookings will be created on your primary calendar.</Notice>}
      {calendar && calendar !== "connected" && <Notice icon="alert" tone="amber" title="Google Calendar was not connected">{decodeURIComponent(calendar).replace(/_/g, " ")}</Notice>}
      {!isGoogleConfigured() && <Notice icon="alert" tone="amber" title="Google OAuth is not configured on this deployment">Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REDIRECT_URI.</Notice>}
      {"error" in data && data.error ? (
        <div className="card panel" role="alert"><h2>Couldn&apos;t load appointments</h2><p className="subline">{data.error.message}</p></div>
      ) : (
        <div className="calendar-layout">
          <div className="card calendar">
            <div className="panel-header">
              <div>
                <h2>{fmtDay.format(days[0])} – {fmtDay.format(days[6])}</h2>
                <div className="panel-label">Week · {data.items.length} appointment{data.items.length === 1 ? "" : "s"} · times in {tz}</div>
              </div>
              {data.mine?.status === "connected" ? <Chip tone="green">Your Google Calendar: {data.mine.google_email ?? "connected"}</Chip> : <Chip tone="amber">Your calendar is not connected</Chip>}
            </div>
            {data.items.length === 0 ? (
              <p className="prompt">No appointments this week. {canBook ? "Book one from the panel." : ""}</p>
            ) : (
              <div className="stack">
                {days.map((d) => {
                  const k = dayKey.format(d);
                  const todays = data.items.filter((a) => dayKey.format(new Date(a.starts_at)) === k);
                  if (!todays.length) return null;
                  return (
                    <div key={k}>
                      <div className="block-heading"><h3>{fmtDay.format(d)}</h3></div>
                      <div className="table-viewport">
                        <table className="data-table">
                          <thead><tr><th>Time</th><th>Purpose</th><th>Customer</th><th>Employee</th><th>Status</th>{canBook && <th>Actions</th>}</tr></thead>
                          <tbody>
                            {todays.map((a) => (
                              <tr key={a.id}>
                                <td>{fmtTime.format(new Date(a.starts_at))}–{fmtTime.format(new Date(a.ends_at))}</td>
                                <td>{a.purpose}</td>
                                <td>{a.contact_name}</td>
                                <td>{a.employee_name}</td>
                                <td><Chip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</Chip>{a.last_error && <small className="subline"> {a.last_error}</small>}</td>
                                {canBook && <td><AppointmentActions id={a.id} status={a.status} /></td>}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <p className="prompt">Bookings check provider availability and store timestamps in UTC with the employee&apos;s IANA timezone.</p>
          </div>

          <div className="card calendar-aside">
            <div className="block-heading">
              <h2>Quick booking</h2>
              <Chip tone={data.mine?.status === "connected" ? "green" : "slate"}>{data.mine?.status === "connected" ? "Connected" : "Not connected"}</Chip>
            </div>
            {data.mine?.status === "connected" ? (
              <div className="connection-note"><Icon name="check" /> {data.mine.google_email ?? "Your Google Calendar"} is connected <DisconnectCalendar /></div>
            ) : canBook ? (
              <a className="btn primary" href="/api/auth/google/start"><Icon name="calendar" /> Connect my Google Calendar</a>
            ) : null}
            {data.mine?.status === "revoked" && <p className="form-error">Google revoked access: reconnect.</p>}
            {canBook ? (
              <BookingForm contacts={data.contacts} employees={data.employees.map((e) => ({ id: e.id, name: e.name, connected: e.connection?.status === "connected" }))} timezone={tz} defaultEmployee={ctx.user.id} />
            ) : <p className="prompt">You can view appointments but not book them.</p>}
            <div className="ghost-divider" />
            <div className="cruise">
              <b>Conflict-aware scheduling</b>
              <p>Times already blocked on an employee&apos;s connected calendar are refused, and local overlaps are rejected in the database.</p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

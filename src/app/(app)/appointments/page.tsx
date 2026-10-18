import { Chip, PageHeader, PendingButton } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";

export const metadata = { title: "Appointments · RelayHQ" };

const DAYS = [["MON", "19"], ["TUE", "20"], ["WED", "21"], ["THU", "22"], ["FRI", "23"]];
const EVENTS = [
  { left: "22%", top: 75, height: 62, title: "Discovery call", who: "Maya Richardson", busy: false },
  { left: "42%", top: 2, height: 61, title: "Busy", who: "Internal meeting", busy: true },
  { left: "62%", top: 149, height: 62, title: "Site survey", who: "Brightline Solar", busy: false },
  { left: "82%", top: 223, height: 61, title: "Proposal review", who: "Horizon Group", busy: false },
];

function Field({ label, value, icon }: { label: string; value: string; icon?: boolean }) {
  return (
    <>
      <label>{label}</label>
      <div className="cal-input">
        {value} {icon ? <Icon name="calendar" /> : <span aria-hidden="true">⌄</span>}
      </div>
    </>
  );
}

export default async function AppointmentsPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote>SAMPLE DATA · Google Calendar is not connected yet</SampleNote>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Appointments"
        subtitle="Plan customer meetings on your team’s connected Google calendars."
        actions={
          <>
            <PendingButton note="Week navigation arrives with the calendar module.">Today</PendingButton>
            <PendingButton style="primary" note="Booking checks Google FreeBusy first and arrives with the calendar module.">
              <Icon name="plus" /> New booking
            </PendingButton>
          </>
        }
      />
      <div className="calendar-layout">
        <div className="card calendar">
          <div className="panel-header">
            <div>
              <h2>October 19 – 23, 2026</h2>
              <div className="panel-label">Work week · Staff availability</div>
            </div>
            <Chip tone="green">Google Calendar connected</Chip>
          </div>
          <div className="weekday-row">
            <div />
            {DAYS.map(([d, n]) => (
              <div key={d}>
                {d}
                <b>{n}</b>
              </div>
            ))}
          </div>
          <div className="timegrid">
            {[9, 10, 11, 12, 13].map((h) => (
              <div key={h} style={{ display: "contents" }}>
                <div className="time-label">{h}:00</div>
                {DAYS.map(([d]) => (
                  <div className="slot" key={d} />
                ))}
              </div>
            ))}
            {EVENTS.map((e) => (
              <div key={e.title} className={`event-block${e.busy ? " busy" : ""}`} style={{ position: "absolute", left: e.left, width: "18%", top: e.top, height: e.height }}>
                <b>{e.title}</b>
                {e.who}
              </div>
            ))}
          </div>
          <p className="prompt">Bookings check provider availability and store timestamps in UTC with the employee&apos;s IANA timezone.</p>
        </div>

        <div className="card calendar-aside">
          <div className="block-heading">
            <h2>Quick booking</h2>
            <Chip tone="green">Available</Chip>
          </div>
          <div className="connection-note">
            <Icon name="check" /> Olivia&apos;s Google Calendar is connected
          </div>
          <Field label="Customer" value="Maya Richardson" />
          <Field label="Assigned employee" value="Olivia Chen" />
          <Field label="Appointment date" value="Tuesday, Oct 20, 2026" icon />
          <Field label="Available time" value="11:00 AM – 11:30 AM" />
          <Field label="Meeting purpose" value="Discovery call" />
          <PendingButton style="primary" note="A real Google Calendar event is created after a FreeBusy check; arrives with the calendar module.">
            Book on Google Calendar <Icon name="arrow" />
          </PendingButton>
          <div className="ghost-divider" />
          <div className="cruise">
            <b>Conflict-aware scheduling</b>
            <p>Times already blocked on an employee&apos;s connected calendar are warned or unavailable, with timezone conversion handled explicitly.</p>
          </div>
        </div>
      </div>
    </>
  );
}

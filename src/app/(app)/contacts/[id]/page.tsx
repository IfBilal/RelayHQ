import { Avatar, Chip, LinkButton, PageHeader, PendingButton, Timeline } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";

export const metadata = { title: "Customer profile · RelayHQ" };

export default async function ContactPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote />
      <PageHeader
        workspace={ctx.workspace.name}
        title="Customer profile"
        subtitle="One place for every conversation, opportunity, payment and appointment."
        actions={
          <>
            <LinkButton href="/inbox"><Icon name="chat" /> Message</LinkButton>
            <LinkButton href="/appointments" style="primary"><Icon name="plus" /> Book appointment</LinkButton>
          </>
        }
      />

      <div className="card profile-banner" style={{ padding: "24px 26px", marginBottom: 18, display: "flex", alignItems: "center", gap: 20 }}>
        <Avatar name="Maya Richardson" tone="warm" style={{ width: 67, height: 67, fontSize: 20 }} />
        <div style={{ flex: 1 }}>
          <div className="profile-name">Maya Richardson</div>
          <div className="subline">maya.richardson@example.com · +1 415 555 0184</div>
          <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            <Chip tone="amber">Active lead</Chip>
            <Chip tone="green">Solar installation</Chip>
            <Chip tone="slate">Web form</Chip>
          </div>
        </div>
        <div className="profile-meta">
          <div className="label-kpi">Assigned owner</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7 }}>
            <Avatar name="Olivia Chen" />
            <b>Olivia Chen</b>
          </div>
          <div className="statline">Escalated 2 minutes ago</div>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="panel-header">
              <div>
                <h2>Active opportunity</h2>
                <div className="panel-label">Solar sales · Proposal sent</div>
              </div>
              <Chip tone="slate">$8,500 projected</Chip>
            </div>
            <div className="info-grid">
              <div><div className="label-kpi">Service</div><b>Residential solar + battery</b></div>
              <div><div className="label-kpi">Site assessment</div><b>Completed</b></div>
              <div><div className="label-kpi">Next stage</div><b>Negotiation</b></div>
              <div><div className="label-kpi">Deal owner</div><b>Olivia Chen</b></div>
            </div>
          </div>
          <div className="card panel">
            <div className="panel-header">
              <div>
                <h2>Unified activity</h2>
                <div className="panel-label">Customer context, in time order</div>
              </div>
              <PendingButton style="small" note="The full activity log reads audited events and arrives with the CRM module.">View all</PendingButton>
            </div>
            <Timeline
              entries={[
                { title: "Lead reassigned after deadline", body: "Ownership changed from Daniel Lee to Olivia Chen. External alert queued.", meta: "Today · 10:42 · System", urgent: true },
                { title: "WhatsApp message received", body: "“Can we schedule a quick call about a home battery?”", meta: "Today · 10:18 · Twilio" },
                { title: "Opportunity moved to Proposal", body: "Sana Ali updated the pipeline stage.", meta: "Yesterday · 16:30 · Sana Ali" },
                { title: "Contact created from web form", body: "Initial service request captured with source attribution.", meta: "Oct 16 · 09:12 · System" },
              ]}
            />
          </div>
        </div>
        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="block-heading">
              <h2>Payment requests</h2>
              <PendingButton style="small primary" note="Stripe hosted checkout arrives with the payments module.">Request payment</PendingButton>
            </div>
            <div className="label-kpi">Deposit request</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8 }}>
              <strong style={{ fontSize: 23, color: "#294852" }}>$2,000</strong>
              <Chip tone="amber">Pending</Chip>
            </div>
            <p className="prompt">Collected revenue changes only after signed Stripe webhook confirmation.</p>
          </div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="block-heading">
              <h2>Next appointment</h2>
              <Chip tone="green">Calendar linked</Chip>
            </div>
            <b style={{ fontSize: 13 }}>Site assessment follow-up</b>
            <p className="subline" style={{ marginTop: 8 }}>Tue, Oct 20 · 11:00 – 11:30 AM</p>
            <p className="prompt">Google Calendar · Olivia Chen</p>
            <LinkButton href="/appointments" style="small">View appointment</LinkButton>
          </div>
          <div className="cruise">
            <b>Customer relationship, not fragmented data.</b>
            <p>Live conversations, audited handoffs, verified payments and booked events stay connected to one contact.</p>
          </div>
        </div>
      </div>
    </>
  );
}

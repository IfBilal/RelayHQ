import { notFound } from "next/navigation";
import { z } from "zod";
import { Avatar, Chip, LinkButton, PageHeader, Timeline } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { getContact360 } from "@/features/crm/server/contacts";
import { NoteForm } from "@/features/crm/components/note-form";
import { formatMoney, formatWhen } from "@/features/crm/format";

export const metadata = { title: "Customer profile · RelayHQ" };

const KIND_TITLE: Record<string, string> = {
  note: "Note added",
  stage_change: "Stage changed",
  field_edit: "Details updated",
  assignment: "Owner changed",
  message: "Message",
  payment: "Payment",
  appointment: "Appointment",
  system: "Activity",
};

export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "crm.view")) notFound();
  const data = await getContact360(ctx, id);
  if (!data) notFound();
  const { contact, opportunities, activity } = data;
  const tz = ctx.workspace.timezone;
  const lead = opportunities[0];

  return (
    <>
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

      <div className="card profile-banner" style={{ padding: "24px 26px", marginBottom: 18, display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
        <Avatar name={contact.name} tone="warm" style={{ width: 67, height: 67, fontSize: 20 }} />
        <div style={{ flex: 1, minWidth: 220 }}>
          <div className="profile-name">{contact.name}</div>
          <div className="subline">{[contact.email, contact.phone_e164].filter(Boolean).join(" · ") || "No contact details yet"}</div>
          <div style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
            {contact.company && <Chip tone="green">{contact.company.name}</Chip>}
            {contact.opted_out && <Chip tone="slate">Opted out of messages</Chip>}
            {!contact.company && !contact.opted_out && <Chip tone="slate">Contact</Chip>}
          </div>
        </div>
        <div className="profile-meta">
          <div className="label-kpi">Assigned owner</div>
          <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 7 }}>
            {data.ownerName ? <Avatar name={data.ownerName} /> : null}
            <b>{data.ownerName ?? "Unassigned"}</b>
          </div>
        </div>
      </div>

      <div className="detail-grid">
        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="panel-header">
              <div>
                <h2>Opportunities</h2>
                <div className="panel-label">{opportunities.length ? `${opportunities.length} linked to this contact` : "Nothing in the pipeline yet"}</div>
              </div>
              {can(ctx, "crm.create") && (
                <LinkButton href={`/opportunities/new?contactId=${contact.id}`} style="small primary">
                  <Icon name="plus" /> New opportunity
                </LinkButton>
              )}
            </div>
            {opportunities.length === 0 ? (
              <p className="subline">Create an opportunity to track this customer through your pipeline.</p>
            ) : (
              <div className="info-grid">
                {opportunities.map((o) => (
                  <div key={o.id}>
                    <div className="label-kpi">{o.stage_name}</div>
                    <b>{o.title}</b>
                    {o.value_minor !== undefined && <div className="statline">{formatMoney(o.value_minor, o.currency)} projected</div>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="card panel">
            <div className="panel-header">
              <div>
                <h2>Unified activity</h2>
                <div className="panel-label">Customer context, in time order</div>
              </div>
            </div>
            {can(ctx, "crm.edit") && <NoteForm contactId={contact.id} />}
            {activity.length === 0 ? (
              <p className="subline">No activity yet. Notes, stage changes, messages, payments and appointments appear here.</p>
            ) : (
              <Timeline
                entries={activity.map((a) => ({
                  title: a.kind === "note" ? KIND_TITLE.note : (a.body && a.kind === "system" ? a.body : KIND_TITLE[a.kind] ?? "Activity"),
                  body: a.kind === "note" ? (a.body ?? "") : a.kind === "stage_change" ? "Moved to a new pipeline stage." : "",
                  meta: `${formatWhen(a.created_at, tz)} · ${a.actor_name ?? "System"}`,
                  urgent: a.kind === "assignment",
                }))}
              />
            )}
          </div>
        </div>

        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="block-heading">
              <h2>Payment requests</h2>
            </div>
            <p className="subline">No payment requests yet.</p>
            <p className="prompt">Collected revenue changes only after signed Stripe webhook confirmation.</p>
          </div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="block-heading">
              <h2>Next appointment</h2>
            </div>
            <p className="subline">No appointments booked.</p>
            <p className="prompt">Bookings appear here once Google Calendar is connected.</p>
          </div>
          {lead && (
            <div className="cruise">
              <b>{lead.title}</b>
              <p>Currently in {lead.stage_name}.</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Avatar, Chip, LinkButton, PageHeader, Timeline } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { getLead, teamOverview } from "@/features/leads/server/leads";
import { SOURCE_LABEL } from "@/features/leads/types";
import { Countdown } from "@/features/leads/components/countdown";
import { AcknowledgeButton, ReassignControl } from "@/features/leads/components/lead-actions";
import { formatWhen } from "@/features/crm/format";

export const metadata = { title: "Lead · RelayHQ" };

const CAUSE: Record<string, string> = {
  capture: "Assigned on capture",
  timeout: "Escalated: acknowledgement window expired",
  manual: "Reassigned manually",
  absence: "Reassigned: owner became unavailable",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "lead.view")) notFound();
  const data = await getLead(ctx, id);
  if (!data) notFound();
  const { lead, contact, ownerName, events } = data;
  const team = can(ctx, "lead.reassign") ? await teamOverview(ctx) : null;
  const members = team && !team.error ? team.items.map((m) => ({ id: m.user_id, name: m.display_name ?? "Team member" })) : [];
  const mine = lead.owner_user_id === ctx.user.id;
  const awaiting = lead.status === "open" && !lead.acknowledged_at;
  const tz = ctx.workspace.timezone;

  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title={contact?.name ?? "Lead"}
        subtitle={lead.summary || "No details provided"}
        actions={<LinkButton href={`/contacts/${lead.contact_id}`}>Open customer profile</LinkButton>}
      />

      <div className="detail-grid">
        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <div className="panel-header">
              <div>
                <h2>Accountable owner</h2>
                <div className="panel-label">One person owns this lead at any moment</div>
              </div>
              {lead.emergency && <Chip tone="rose">Emergency owner: no available employee</Chip>}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
              <Avatar name={ownerName ?? "?"} tone="warm" />
              <div>
                <b>{ownerName ?? "Unknown"}</b>
                <div className="statline">Assigned {formatWhen(lead.assigned_at, tz)}</div>
              </div>
              <div style={{ marginLeft: "auto", textAlign: "right" }}>
                <div className="label-kpi">{awaiting ? "Response timer" : "Status"}</div>
                <div style={{ marginTop: 6 }}>
                  {lead.status === "closed" ? <Chip tone="slate">Closed</Chip> : awaiting ? <Countdown deadlineAt={lead.deadline_at} /> : <Chip tone="green">Acknowledged</Chip>}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
              {awaiting && (mine || can(ctx, "lead.reassign")) && <AcknowledgeButton leadId={lead.id} version={lead.version} small={false} />}
              {can(ctx, "lead.reassign") && lead.status === "open" && <ReassignControl leadId={lead.id} version={lead.version} currentOwner={lead.owner_user_id} members={members} />}
            </div>
            {!mine && !can(ctx, "lead.reassign") && <p className="helptext">Only the owner can acknowledge this lead.</p>}
          </div>

          <div className="card panel">
            <div className="panel-header">
              <div>
                <h2>Assignment history</h2>
                <div className="panel-label">Who was accountable, and why it changed</div>
              </div>
            </div>
            <Timeline
              entries={events.map((e) => ({
                title: CAUSE[e.cause] ?? e.cause,
                body: e.from_name ? `${e.from_name} → ${e.to_name ?? "Unknown"}` : `Assigned to ${e.to_name ?? "Unknown"}`,
                meta: `${formatWhen(e.created_at, tz)} · ${e.cause === "timeout" ? "System" : e.cause === "capture" ? "System" : "Team"}`,
                urgent: e.cause === "timeout",
              }))}
            />
          </div>
        </div>

        <div>
          <div className="card panel" style={{ marginBottom: 18 }}>
            <h2>Details</h2>
            <div className="aside-kv"><span>Source</span><b>{SOURCE_LABEL[lead.source]}</b></div>
            <div className="aside-kv"><span>Received</span><b>{formatWhen(lead.created_at, tz)}</b></div>
            <div className="aside-kv"><span>Escalations</span><b>{lead.escalation_count}</b></div>
            <div className="aside-kv"><span>First response</span><b>{lead.first_acknowledged_at ? formatWhen(lead.first_acknowledged_at, tz) : "Waiting"}</b></div>
            {contact && (
              <>
                <div className="ghost-divider" />
                <div className="aside-kv"><span>Phone</span><b>{contact.phone_e164 ?? "—"}</b></div>
                <div className="aside-kv"><span>Email</span><b>{contact.email ?? "—"}</b></div>
              </>
            )}
          </div>
          <Link href="/leads/recovery" className="btn small">Back to recovery queue</Link>
        </div>
      </div>
    </>
  );
}

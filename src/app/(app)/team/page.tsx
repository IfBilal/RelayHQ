import { Avatar, Chip, PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { AvailabilitySelect } from "@/features/leads/components/availability-select";
import { loadTeam } from "@/features/team/server/team";
import { InvitationList, InviteForm, MemberAccess, RoleMatrix } from "@/features/team/components/team-panels";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Team · RelayHQ" };

const STATUS: Record<string, { label: string; tone: "green" | "amber" | "slate" }> = {
  available: { label: "Available", tone: "green" },
  busy: { label: "Busy", tone: "amber" },
  on_leave: { label: "On leave", tone: "slate" },
  offline: { label: "Offline", tone: "slate" },
};

export default async function TeamPage() {
  const ctx = (await getSessionContext())!;
  const team = await loadTeam(ctx);
  const canInvite = can(ctx, "team.invite");
  const canRoles = can(ctx, "role.manage");
  const canAvail = can(ctx, "assignment.manage");

  if ("error" in team) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Team" subtitle="People, roles and permissions." />
        <div className="card panel" role="alert"><h2>We couldn&apos;t load the team</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      </>
    );
  }

  const supabase = await createClient();
  const { data: catalog } = await supabase.from("permissions").select("key, description").order("key");

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Team" subtitle="Invite people, set what each role can do, and manage availability." />
      <div className="card panel" style={{ marginBottom: 18 }}>
        <h2>Members</h2>
        <div className="ghost-divider" />
        {team.members.map((m) => (
          <div className="member" style={{ marginBottom: 17, flexWrap: "wrap" }} key={m.user_id}>
            <Avatar name={m.name} />
            <div className="member-main">
              <div className="member-name">{m.name}{m.user_id === ctx.user.id ? " (you)" : ""}</div>
              <div className="member-secondary">{m.base_role === "owner" ? "Owner" : m.base_role === "admin" ? "Admin" : "Team member"}{m.enabled ? "" : " · deactivated"}</div>
            </div>
            <MemberAccess member={m} roles={team.roles} isSelf={m.user_id === ctx.user.id} canEdit={canRoles} isOwner={ctx.baseRole === "owner"} />
            {canAvail && m.enabled ? (
              <AvailabilitySelect value={m.availability} userId={m.user_id} label={`Status for ${m.name}`} />
            ) : (
              <Chip tone={STATUS[m.availability]?.tone ?? "slate"}>{STATUS[m.availability]?.label ?? m.availability}</Chip>
            )}
          </div>
        ))}
      </div>

      {canInvite && (
        <div className="rules-grid" style={{ marginBottom: 18 }}>
          <InviteForm roles={team.roles} isOwner={ctx.baseRole === "owner"} />
          <div className="card panel">
            <h2>Pending invitations</h2>
            <div className="ghost-divider" />
            <InvitationList items={team.invitations} />
          </div>
        </div>
      )}

      <h2 style={{ margin: "8px 0 12px" }}>Role permissions</h2>
      {!canRoles && <p className="subline" style={{ marginBottom: 10 }}>You can view roles but only people with the role-management permission can change them.</p>}
      <RoleMatrix roles={team.roles} catalog={catalog ?? []} canEdit={canRoles} />
    </>
  );
}

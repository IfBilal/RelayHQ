import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface MemberRow {
  user_id: string;
  base_role: "owner" | "admin" | "user";
  permission_role_id: string | null;
  availability: string;
  enabled: boolean;
  name: string;
}
export interface RoleRow { id: string; name: string; permissions: string[] }
export interface InvitationRow { id: string; email: string; base_role: string; role_name: string; expires_at: string }

/** Everything reads through RLS: members see the team and roles, only team.invite holders see invitations. */
export async function loadTeam(ctx: SessionContext) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const canInvite = ctx.permissions.includes("team.invite");
  const [members, roles, grants, invites] = await Promise.all([
    supabase.from("memberships").select("user_id, base_role, permission_role_id, availability, enabled").eq("workspace_id", ws).order("created_at"),
    supabase.from("permission_roles").select("id, name").eq("workspace_id", ws).order("name"),
    supabase.from("role_grants").select("role_id, permission").eq("workspace_id", ws),
    canInvite
      ? supabase.from("invitations").select("id, email, base_role, permission_role_id, expires_at").eq("workspace_id", ws).is("accepted_at", null).gt("expires_at", new Date().toISOString())
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (members.error || roles.error || grants.error || invites.error) return { error: true } as const;

  const ids = (members.data ?? []).map((m) => m.user_id);
  const { data: profiles } = await supabase.from("profiles").select("id, display_name").in("id", ids);
  const names = new Map((profiles ?? []).map((p) => [p.id, p.display_name]));
  const roleList: RoleRow[] = (roles.data ?? []).map((r) => ({
    ...r,
    permissions: (grants.data ?? []).filter((g) => g.role_id === r.id).map((g) => g.permission),
  }));
  const roleName = new Map(roleList.map((r) => [r.id, r.name]));
  return {
    members: (members.data ?? []).map((m) => ({ ...m, name: names.get(m.user_id) || "Team member" })) as MemberRow[],
    roles: roleList,
    invitations: (invites.data ?? []).map((i) => ({ id: i.id, email: i.email, base_role: i.base_role, role_name: roleName.get(i.permission_role_id) ?? "", expires_at: i.expires_at })) as InvitationRow[],
  } as const;
}

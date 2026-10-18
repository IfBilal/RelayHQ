import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Availability, BaseRole, Permission } from "@/contracts/permissions";

export interface SessionContext {
  user: { id: string; email: string; displayName: string };
  workspace: { id: string; name: string; slug: string; timezone: string; currency: string };
  baseRole: BaseRole;
  availability: Availability;
  permissions: Permission[];
}

/**
 * Verified identity + workspace + effective permissions for the current request.
 * Identity comes from Supabase Auth (`getUser`), never from request input; permissions
 * are read live so a revoked grant applies on the next request.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return null;

  const [{ data: membership }, { data: profile }] = await Promise.all([
    supabase
      .from("memberships")
      .select("workspace_id, base_role, availability, permission_role_id, workspaces(id, name, slug, timezone, currency)")
      .eq("user_id", auth.user.id)
      .eq("enabled", true)
      .order("created_at")
      .limit(1)
      .maybeSingle(),
    supabase.from("profiles").select("display_name").eq("id", auth.user.id).maybeSingle(),
  ]);
  if (!membership?.workspaces) return null;
  const ws = membership.workspaces as unknown as SessionContext["workspace"];

  let permissions: Permission[];
  if (membership.base_role === "owner") {
    const { data } = await supabase.from("permissions").select("key");
    permissions = (data ?? []).map((p) => p.key as Permission);
  } else {
    const { data } = await supabase
      .from("role_grants")
      .select("permission")
      .eq("role_id", membership.permission_role_id!);
    permissions = (data ?? []).map((g) => g.permission as Permission);
  }

  return {
    user: {
      id: auth.user.id,
      email: auth.user.email ?? "",
      displayName: profile?.display_name || auth.user.email || "",
    },
    workspace: ws,
    baseRole: membership.base_role as BaseRole,
    availability: membership.availability as Availability,
    permissions,
  };
});

export function can(ctx: SessionContext, permission: Permission) {
  return ctx.permissions.includes(permission);
}

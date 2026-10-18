import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";
import { inviteSchema } from "@/features/team/schemas";
import { newInviteToken } from "@/features/team/server/token";

/** The database checks team.invite (and that only the Owner invites Admins); the raw token is returned once and never stored. */
export async function POST(request: Request) {
  const guard = await requireSession("team.invite");
  if (guard.response) return guard.response;
  const body = await readJson(request, inviteSchema);
  if (body.response) return body.response;

  const { token, hash } = newInviteToken();
  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member", {
    p_workspace: guard.ctx.workspace.id,
    p_email: body.data.email,
    p_base_role: body.data.baseRole,
    p_role: body.data.roleId,
    p_token_hash: hash,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ inviteUrl: `${appUrl()}/invite?token=${token}` }, { status: 201 });
}

import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** Revokes a pending invitation. The database checks team.invite and that Admin-level invites are the Owner's. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ invitationId: string }> }) {
  const guard = await requireSession("team.invite");
  if (guard.response) return guard.response;
  const { invitationId } = await params;
  if (!z.uuid().safeParse(invitationId).success) return errorResponse("not_found", "That invitation doesn't exist.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invitation", { p_workspace: guard.ctx.workspace.id, p_invitation: invitationId });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

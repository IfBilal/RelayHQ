import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { accessSchema } from "@/features/team/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await requireSession("role.manage");
  if (guard.response) return guard.response;
  const { userId } = await params;
  if (!z.uuid().safeParse(userId).success) return errorResponse("not_found", "That team member doesn't exist.");
  const body = await readJson(request, accessSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { error } = await supabase.rpc("change_member_access", {
    p_workspace: guard.ctx.workspace.id,
    p_target: userId,
    p_base_role: body.data.baseRole,
    p_role: body.data.roleId,
    p_enabled: body.data.enabled,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

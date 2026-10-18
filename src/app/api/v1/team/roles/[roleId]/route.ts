import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { rolePermissionsSchema } from "@/features/team/schemas";

export async function PUT(request: Request, { params }: { params: Promise<{ roleId: string }> }) {
  const guard = await requireSession("role.manage");
  if (guard.response) return guard.response;
  const { roleId } = await params;
  if (!z.uuid().safeParse(roleId).success) return errorResponse("not_found", "That role doesn't exist.");
  const body = await readJson(request, rolePermissionsSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_role_permissions", {
    p_workspace: guard.ctx.workspace.id,
    p_role: roleId,
    p_permissions: body.data.permissions,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

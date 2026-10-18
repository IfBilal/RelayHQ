import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { availabilitySchema } from "@/features/leads/schemas";

/** `userId` is a member id, or "me". The database decides whether the caller may change that member. */
export async function PATCH(request: Request, { params }: { params: Promise<{ userId: string }> }) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const { userId } = await params;
  const target = userId === "me" ? guard.ctx.user.id : userId;
  if (!z.uuid().safeParse(target).success) return errorResponse("not_found", "That team member doesn't exist.");
  const body = await readJson(request, availabilitySchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_availability", {
    p_workspace: guard.ctx.workspace.id,
    p_target: target,
    p_status: body.data.status,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

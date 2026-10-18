import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { stageMoveSchema } from "@/features/crm/schemas";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession("crm.edit");
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return errorResponse("not_found", "That opportunity doesn't exist or you can't access it.");
  const body = await readJson(request, stageMoveSchema);
  if (body.response) return body.response;

  const supabase = await createClient();
  const { data: version, error } = await supabase.rpc("move_opportunity_stage", {
    p_workspace: guard.ctx.workspace.id,
    p_opportunity: id,
    p_stage: body.data.targetStageId,
    p_expected_version: body.data.expectedVersion,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ version });
}

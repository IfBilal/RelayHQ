import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { opportunityCreateSchema, toMinorUnits } from "@/features/crm/schemas";

export async function POST(request: Request) {
  const guard = await requireSession("crm.create");
  if (guard.response) return guard.response;
  const body = await readJson(request, opportunityCreateSchema);
  if (body.response) return body.response;
  const { data } = body;

  const supabase = await createClient();
  const { data: id, error } = await supabase.rpc("create_opportunity", {
    p_workspace: guard.ctx.workspace.id,
    p_contact: data.contactId,
    p_pipeline: data.pipelineId,
    p_stage: data.stageId,
    p_title: data.title,
    p_currency: data.currency,
    p_value_minor: data.value === undefined ? null : toMinorUnits(data.value),
    p_owner: null,
    p_custom: data.customValues,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ id }, { status: 201 });
}

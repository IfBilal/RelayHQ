import { readJson, requireSession } from "@/lib/api";
import { requiredFieldsSchema } from "@/features/crm/config-schemas";
import { callRpc, idOr404 } from "@/features/crm/server/config-rpc";

export async function PUT(request: Request, { params }: { params: Promise<{ stageId: string }> }) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { stageId } = await params;
  const bad = idOr404(stageId, "stage");
  if (bad) return bad;
  const body = await readJson(request, requiredFieldsSchema);
  if (body.response) return body.response;
  return callRpc("set_stage_required_fields", { p_workspace: guard.ctx.workspace.id, p_stage: stageId, p_fields: body.data.fields });
}

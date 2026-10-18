import { readJson, requireSession } from "@/lib/api";
import { reorderSchema, stageSchema } from "@/features/crm/config-schemas";
import { callRpc, idOr404 } from "@/features/crm/server/config-rpc";

type Ctx = { params: Promise<{ pipelineId: string }> };

export async function POST(request: Request, { params }: Ctx) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { pipelineId } = await params;
  const bad = idOr404(pipelineId, "pipeline");
  if (bad) return bad;
  const body = await readJson(request, stageSchema);
  if (body.response) return body.response;
  return callRpc("add_stage", { p_workspace: guard.ctx.workspace.id, p_pipeline: pipelineId, p_name: body.data.name }, 201);
}

export async function PUT(request: Request, { params }: Ctx) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { pipelineId } = await params;
  const bad = idOr404(pipelineId, "pipeline");
  if (bad) return bad;
  const body = await readJson(request, reorderSchema);
  if (body.response) return body.response;
  return callRpc("reorder_stages", { p_workspace: guard.ctx.workspace.id, p_pipeline: pipelineId, p_order: body.data.order });
}

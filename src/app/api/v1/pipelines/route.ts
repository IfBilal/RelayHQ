import { errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { getBoard } from "@/features/crm/server/pipelines";
import { pipelineSchema } from "@/features/crm/config-schemas";
import { callRpc } from "@/features/crm/server/config-rpc";

export async function GET(request: Request) {
  const guard = await requireSession("crm.view");
  if (guard.response) return guard.response;
  const pipelineId = new URL(request.url).searchParams.get("pipelineId") ?? undefined;
  const board = await getBoard(guard.ctx, pipelineId);
  if (!board) return errorResponse("not_found", "No pipeline found.");
  return Response.json(board);
}

export async function POST(request: Request) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const body = await readJson(request, pipelineSchema);
  if (body.response) return body.response;
  return callRpc("create_pipeline", { p_workspace: guard.ctx.workspace.id, p_name: body.data.name }, 201);
}

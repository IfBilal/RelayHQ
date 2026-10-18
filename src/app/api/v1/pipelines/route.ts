import { errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { getBoard } from "@/features/crm/server/pipelines";

export async function GET(request: Request) {
  const guard = await requireSession("crm.view");
  if (guard.response) return guard.response;
  const pipelineId = new URL(request.url).searchParams.get("pipelineId") ?? undefined;
  const board = await getBoard(guard.ctx, pipelineId);
  if (!board) return errorResponse("not_found", "No pipeline found.");
  return Response.json(board);
}

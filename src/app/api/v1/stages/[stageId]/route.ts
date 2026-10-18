import { z } from "zod";
import { errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { stageSchema } from "@/features/crm/config-schemas";
import { callRpc, idOr404 } from "@/features/crm/server/config-rpc";

type Ctx = { params: Promise<{ stageId: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { stageId } = await params;
  const bad = idOr404(stageId, "stage");
  if (bad) return bad;
  const body = await readJson(request, stageSchema);
  if (body.response) return body.response;
  return callRpc("rename_stage", { p_workspace: guard.ctx.workspace.id, p_stage: stageId, p_name: body.data.name });
}

/** A populated stage needs ?moveTo=<stage in the same pipeline>; otherwise the database answers 409 with the counts. */
export async function DELETE(request: Request, { params }: Ctx) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { stageId } = await params;
  const bad = idOr404(stageId, "stage");
  if (bad) return bad;
  const moveTo = new URL(request.url).searchParams.get("moveTo");
  if (moveTo && !z.uuid().safeParse(moveTo).success) return errorResponse("validation_failed", "Pick a valid destination stage.");
  return callRpc("delete_stage", { p_workspace: guard.ctx.workspace.id, p_stage: stageId, p_move_to: moveTo });
}

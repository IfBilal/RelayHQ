import { requireSession } from "@/lib/api";
import { callRpc, idOr404 } from "@/features/crm/server/config-rpc";

/** Archives (never hard-deletes) so existing values stay readable. */
export async function DELETE(_request: Request, { params }: { params: Promise<{ fieldId: string }> }) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const { fieldId } = await params;
  const bad = idOr404(fieldId, "field");
  if (bad) return bad;
  return callRpc("archive_field_definition", { p_workspace: guard.ctx.workspace.id, p_field: fieldId });
}

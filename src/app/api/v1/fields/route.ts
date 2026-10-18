import { readJson, requireSession } from "@/lib/api";
import { fieldSchema } from "@/features/crm/config-schemas";
import { callRpc } from "@/features/crm/server/config-rpc";

/** pipelineId null = a field shared by every pipeline of the workspace. */
export async function POST(request: Request) {
  const guard = await requireSession("pipeline.manage");
  if (guard.response) return guard.response;
  const body = await readJson(request, fieldSchema);
  if (body.response) return body.response;
  const f = body.data;
  return callRpc(
    "create_field_definition",
    {
      p_workspace: guard.ctx.workspace.id,
      p_pipeline: f.pipelineId,
      p_key: f.key,
      p_label: f.label,
      p_type: f.type,
      p_options: f.type === "dropdown" ? f.options : [],
      p_help: f.help ?? null,
    },
    201,
  );
}

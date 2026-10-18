import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { manualLeadSchema } from "@/features/leads/schemas";
import { listLeads } from "@/features/leads/server/leads";

export async function GET(request: Request) {
  const guard = await requireSession("lead.view");
  if (guard.response) return guard.response;
  const status = new URL(request.url).searchParams.get("status");
  const result = await listLeads(guard.ctx, { status: status === "closed" ? "closed" : "open" });
  if (result.error) return dbErrorResponse(result.error);
  return Response.json({ items: result.items });
}

export async function POST(request: Request) {
  const guard = await requireSession("lead.create");
  if (guard.response) return guard.response;
  const body = await readJson(request, manualLeadSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("capture_manual_lead", {
    p_workspace: guard.ctx.workspace.id,
    p_contact: body.data.contactId,
    p_summary: body.data.summary,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ id: data }, { status: 201 });
}

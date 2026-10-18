import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

const bodySchema = z.object({ body: z.string().trim().min(1).max(4000), opportunityId: z.uuid().optional() });

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession("crm.edit");
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return errorResponse("not_found", "That contact doesn't exist or you can't access it.");
  const body = await readJson(request, bodySchema);
  if (body.response) return body.response;

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_note", {
    p_workspace: guard.ctx.workspace.id,
    p_contact: id,
    p_opportunity: body.data.opportunityId ?? null,
    p_body: body.data.body,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true }, { status: 201 });
}

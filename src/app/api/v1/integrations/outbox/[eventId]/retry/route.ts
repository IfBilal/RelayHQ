import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

/** Re-queues a failed or dead alert. The database checks integrations.manage and that the row is in this workspace. */
export async function POST(_request: Request, { params }: { params: Promise<{ eventId: string }> }) {
  const guard = await requireSession("integrations.manage");
  if (guard.response) return guard.response;
  const { eventId } = await params;
  if (!z.uuid().safeParse(eventId).success) return errorResponse("not_found", "That alert doesn't exist.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("retry_outbox_event", { p_workspace: guard.ctx.workspace.id, p_event: eventId });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

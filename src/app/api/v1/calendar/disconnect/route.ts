import { dbErrorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";

export async function POST() {
  const guard = await requireSession("appointment.create");
  if (guard.response) return guard.response;
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_calendar", { p_workspace: guard.ctx.workspace.id });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

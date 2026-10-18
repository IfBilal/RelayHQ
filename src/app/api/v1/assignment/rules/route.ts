import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { rulesSchema } from "@/features/leads/schemas";
import { getRules } from "@/features/leads/server/leads";

export async function GET() {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const rules = await getRules(guard.ctx);
  if (!rules) return errorResponse("not_found", "No assignment rules found.");
  return Response.json(rules);
}

export async function PUT(request: Request) {
  const guard = await requireSession("assignment.manage");
  if (guard.response) return guard.response;
  const body = await readJson(request, rulesSchema);
  if (body.response) return body.response;
  const r = body.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc("update_assignment_rules", {
    p_workspace: guard.ctx.workspace.id,
    p_max_open: r.maxOpenLeads,
    p_windows: r.windowsSeconds,
    p_alternates: r.alternateLevels,
    p_backup: r.backupUserId,
    p_manager: r.managerUserId,
    p_idle: r.idleSeconds,
    p_reassign_on_absence: r.reassignOnAbsence,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

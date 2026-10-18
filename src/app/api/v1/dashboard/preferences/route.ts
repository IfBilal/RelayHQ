import { z } from "zod";
import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { WIDGETS } from "@/features/reporting/types";

const schema = z.object({ hiddenWidgets: z.array(z.enum(WIDGETS.map((w) => w.key) as [string, ...string[]])).max(20) });

/** Visibility is a personal preference only; permission masking is always applied on the server regardless. */
export async function PUT(request: Request) {
  const guard = await requireSession("dashboard.view");
  if (guard.response) return guard.response;
  const body = await readJson(request, schema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { error } = await supabase.from("dashboard_preferences").upsert(
    { workspace_id: guard.ctx.workspace.id, user_id: guard.ctx.user.id, hidden_widgets: [...new Set(body.data.hiddenWidgets)], updated_at: new Date().toISOString() },
    { onConflict: "workspace_id,user_id" },
  );
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

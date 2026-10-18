import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/features/team/schemas";

/** Own profile only: RLS (`id = auth.uid()`) and column grants limit this to four fields. */
export async function PATCH(request: Request) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const body = await readJson(request, profileSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: body.data.displayName, timezone: body.data.timezone, notification_email: body.data.notificationEmail })
    .eq("id", guard.ctx.user.id);
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

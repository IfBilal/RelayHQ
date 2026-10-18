import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/features/team/schemas";

/** Own profile only: RLS (`id = auth.uid()`) and column grants limit the table update to name and time zone. */
export async function PATCH(request: Request) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const body = await readJson(request, profileSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  // the alert address goes first (validated and audited in SQL, no direct column grant); only an explicit value changes it
  if (body.data.notificationEmail !== undefined) {
    const mail = await supabase.rpc("set_notification_email", { p_email: body.data.notificationEmail ?? "" });
    if (mail.error) return dbErrorResponse(mail.error);
  }
  const { error } = await supabase
    .from("profiles")
    .update({ display_name: body.data.displayName, timezone: body.data.timezone })
    .eq("id", guard.ctx.user.id);
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

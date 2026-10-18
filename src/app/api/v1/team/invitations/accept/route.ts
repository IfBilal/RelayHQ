import { dbErrorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { acceptSchema } from "@/features/team/schemas";

/** Any signed-in user may redeem a token; the database matches the hash, expiry, single use and the account email. */
export async function POST(request: Request) {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const body = await readJson(request, acceptSchema);
  if (body.response) return body.response;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation", { p_token: body.data.token });
  if (error) return dbErrorResponse(error);
  return Response.json({ workspaceId: data });
}

import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { signupSchema } from "@/features/identity/schemas";

export async function POST(request: Request) {
  const parsed = signupSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return errorResponse("validation_failed", "Check the highlighted fields.", {
      fields: parsed.error.flatten().fieldErrors,
    });
  }
  const { name, email, password, workspaceName, workspaceSlug } = parsed.data;
  const supabase = await createClient();

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name } } });
  if (error) {
    return errorResponse(error.status === 429 ? "rate_limited" : "validation_failed", error.message);
  }
  // Email confirmation enabled: no session yet, the workspace is created after the first sign-in.
  if (!data.session) return Response.json({ needsConfirmation: true }, { status: 202 });

  const { data: workspaceId, error: wsError } = await supabase.rpc("create_workspace", {
    p_name: workspaceName,
    p_slug: workspaceSlug,
  });
  if (wsError) return dbErrorResponse(wsError); // account exists; /onboarding lets them retry
  return Response.json({ workspaceId }, { status: 201 });
}

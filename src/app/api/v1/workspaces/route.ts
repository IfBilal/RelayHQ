import { createClient } from "@/lib/supabase/server";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { z } from "zod";
import { slugSchema } from "@/features/identity/schemas";

const bodySchema = z.object({ name: z.string().trim().min(1).max(80), slug: slugSchema });

/** Creates a workspace for a signed-in user who has none yet (e.g. signup raced a taken slug). */
export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("validation_failed", "Check the workspace name and address.");

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return errorResponse("unauthenticated", "Sign in to continue.");

  const { data, error } = await supabase.rpc("create_workspace", { p_name: parsed.data.name, p_slug: parsed.data.slug });
  if (error) return dbErrorResponse(error);
  return Response.json({ workspaceId: data }, { status: 201 });
}

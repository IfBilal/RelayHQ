import { createClient } from "@/lib/supabase/server";
import { errorResponse } from "@/contracts/errors";
import { loginSchema } from "@/features/identity/schemas";

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse("validation_failed", "Enter your email and password.");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.status === 429) return errorResponse("rate_limited", "Too many attempts. Try again in a minute.");
    return errorResponse("unauthenticated", "Email or password is incorrect.");
  }
  return Response.json({ ok: true });
}

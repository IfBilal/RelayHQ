import { cookies } from "next/headers";
import { errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { beginAuth, isGoogleConfigured } from "@/features/calendar/server/google";

/** Starts the per-user Google consent flow (PKCE). The verifier and state live in an HttpOnly cookie bound to this session. */
export async function GET() {
  const guard = await requireSession("appointment.create");
  if (guard.response) return guard.response;
  if (!isGoogleConfigured()) return errorResponse("internal", "Google Calendar is not configured on this deployment.");
  const { url, verifier, state } = beginAuth();
  const jar = await cookies();
  jar.set("g_oauth", JSON.stringify({ v: verifier, s: state, u: guard.ctx.user.id, w: guard.ctx.workspace.id }), {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/api/auth/google", maxAge: 600,
  });
  return Response.redirect(url, 302);
}

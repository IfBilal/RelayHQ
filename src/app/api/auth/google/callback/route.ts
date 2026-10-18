import { cookies } from "next/headers";
import { getSessionContext } from "@/features/identity/server/session";
import { exchangeCode, saveTokens } from "@/features/calendar/server/google";
import { appUrl } from "@/lib/app-url";

function back(reason: string) {
  return Response.redirect(`${appUrl()}/appointments?calendar=${encodeURIComponent(reason)}`, 302);
}

/** Single-use state check, bound to the signed-in user and workspace; tokens are encrypted before storage. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const jar = await cookies();
  const raw = jar.get("g_oauth")?.value;
  jar.delete({ name: "g_oauth", path: "/api/auth/google" });
  const ctx = await getSessionContext();
  if (!ctx) return back("unauthenticated");
  if (url.searchParams.get("error")) return back("denied");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (!raw || !code || !state) return back("invalid_state");
  let saved: { v: string; s: string; u: string; w: string };
  try { saved = JSON.parse(raw); } catch { return back("invalid_state"); }
  if (saved.s !== state || saved.u !== ctx.user.id || saved.w !== ctx.workspace.id) return back("invalid_state");
  try {
    const tokens = await exchangeCode(code, saved.v);
    await saveTokens(ctx.workspace.id, ctx.user.id, tokens);
    return back("connected");
  } catch (e) {
    return back(e instanceof Error ? e.message.slice(0, 120) : "error");
  }
}

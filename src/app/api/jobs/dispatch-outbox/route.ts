import { timingSafeEqual } from "node:crypto";
import { errorResponse } from "@/contracts/errors";
import { appUrl } from "@/lib/app-url";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchOutbox } from "@/features/notifications/server/dispatch";
import { createResendProvider } from "@/features/notifications/server/resend";
import { createSupabaseOutboxStore } from "@/features/notifications/server/supabase-store";

function authorized(request: Request) {
  const secret = process.env.CRON_DISPATCH_SECRET;
  if (!secret) return false;
  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** Called on a schedule by Supabase Cron. Not a general job runner: it only drains the outbox. */
export async function POST(request: Request) {
  if (!authorized(request)) return errorResponse("unauthenticated", "Not authorized.");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL) {
    return errorResponse("internal", "The dispatcher is not configured on this deployment.");
  }
  let base: string;
  try {
    base = appUrl();
  } catch {
    return errorResponse("internal", "APP_URL is not configured correctly on this deployment.");
  }
  const result = await dispatchOutbox({
    store: createSupabaseOutboxStore(createAdminClient()),
    email: createResendProvider(),
    appUrl: base,
  });
  return Response.json({ sent: result.sent, failed: result.failed });
}

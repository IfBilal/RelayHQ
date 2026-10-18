import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/contracts/errors";
import { isCrossSiteMutation } from "@/lib/origin";

/** Refreshes the Supabase session cookie on every request. Authorization happens in handlers/RLS, not here. */
export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  // The anonymous lead form is meant to be embeddable from other sites; the DB rate-limits it.
  if (pathname.startsWith("/api/v1/") && !pathname.startsWith("/api/v1/public/") && isCrossSiteMutation(request.method, request.headers)) {
    return errorResponse("forbidden", "Cross-site requests are not allowed.");
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(list) {
          list.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );
  await supabase.auth.getUser(); // verifies with Auth server and refreshes tokens
  return response;
}

export const config = {
  // Skip static assets and signed provider webhooks (no user session there).
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/webhooks|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};

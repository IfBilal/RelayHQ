import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createClient } from "@supabase/supabase-js";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson } from "@/lib/api";
import { publicLeadSchema } from "@/features/leads/schemas";

/**
 * Anonymous lead intake. Input is validated here, then handed to a fixed-purpose database function
 * that re-validates, throttles per client and per workspace, and assigns exactly one owner.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) return errorResponse("not_found", "This form doesn't exist.");
  const body = await readJson(request, publicLeadSchema);
  if (body.response) return body.response;
  const data = body.data;

  // Honeypot filled in: pretend success so bots learn nothing.
  if (data.website) return Response.json({ ok: true }, { status: 201 });

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const clientHash = createHash("sha256").update(ip + "|" + slug).digest("hex").slice(0, 32); // no raw IPs stored

  // The anon key only: this path never uses elevated credentials.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error } = await supabase.rpc("submit_public_lead", {
    p_slug: slug,
    p_name: data.name,
    p_email: data.email ?? null,
    p_phone: data.phone ?? null,
    p_summary: data.summary,
    p_dedupe_key: data.dedupeKey ?? null,
    p_client_hash: clientHash,
  });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true }, { status: 201 });
}

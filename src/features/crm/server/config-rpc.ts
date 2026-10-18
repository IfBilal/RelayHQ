import "server-only";
import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { createClient } from "@/lib/supabase/server";

/** Runs one permission-checked SQL function as the caller; the database enforces pipeline.manage and writes the audit row. */
export async function callRpc(fn: string, args: Record<string, unknown>, status = 200) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true, data }, { status });
}

export const idOr404 = (id: string, what: string) =>
  z.uuid().safeParse(id).success ? null : errorResponse("not_found", `That ${what} doesn't exist.`);

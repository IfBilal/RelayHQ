import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { listAudit } from "@/features/audit/server/audit";

const query = z.object({
  action: z.string().max(60).optional(),
  actor: z.union([z.uuid(), z.literal("system")]).optional(),
  from: z.iso.datetime().optional(),
  to: z.iso.datetime().optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export async function GET(request: Request) {
  const guard = await requireSession("audit.view");
  if (guard.response) return guard.response;
  const parsed = query.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse("validation_failed", "Invalid filters.");
  const result = await listAudit(guard.ctx, parsed.data);
  if (result.error) return dbErrorResponse(result.error);
  return Response.json(result);
}

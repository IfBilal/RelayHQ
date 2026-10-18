import { z } from "zod";
import { errorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { getLead } from "@/features/leads/server/leads";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession("lead.view");
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) return errorResponse("not_found", "That lead doesn't exist or you can't access it.");
  const data = await getLead(guard.ctx, id);
  if (!data) return errorResponse("not_found", "That lead doesn't exist or you can't access it.");
  return Response.json(data);
}

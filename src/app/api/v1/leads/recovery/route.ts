import { dbErrorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { recoveryQueue } from "@/features/leads/server/leads";

export async function GET() {
  const guard = await requireSession("lead.view");
  if (guard.response) return guard.response;
  const result = await recoveryQueue(guard.ctx);
  if (result.error) return dbErrorResponse(result.error);
  return Response.json({ items: result.items, count: result.items.length });
}

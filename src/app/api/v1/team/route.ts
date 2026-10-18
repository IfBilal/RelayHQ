import { dbErrorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { teamOverview } from "@/features/leads/server/leads";

export async function GET() {
  const guard = await requireSession();
  if (guard.response) return guard.response;
  const result = await teamOverview(guard.ctx);
  if (result.error) return dbErrorResponse(result.error);
  return Response.json({ items: result.items });
}

import { dbErrorResponse } from "@/contracts/errors";
import { requireSession } from "@/lib/api";
import { getOverview } from "@/features/reporting/server/overview";

export async function GET() {
  const guard = await requireSession("dashboard.view");
  if (guard.response) return guard.response;
  const result = await getOverview(guard.ctx);
  if (result.error) return dbErrorResponse(result.error);
  return Response.json(result.overview);
}

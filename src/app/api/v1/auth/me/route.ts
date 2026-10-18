import { errorResponse } from "@/contracts/errors";
import { getSessionContext } from "@/features/identity/server/session";

export async function GET() {
  const ctx = await getSessionContext();
  if (!ctx) return errorResponse("unauthenticated", "Sign in to continue.");
  return Response.json(ctx);
}

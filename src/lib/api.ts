import "server-only";
import type { z } from "zod";
import { errorResponse } from "@/contracts/errors";
import { getSessionContext, type SessionContext } from "@/features/identity/server/session";
import type { Permission } from "@/contracts/permissions";

type Guard = { ctx: SessionContext; response?: undefined } | { ctx?: undefined; response: Response };

/** Resolves the verified caller, and optionally requires a permission; routes return `response` as-is. */
export async function requireSession(permission?: Permission): Promise<Guard> {
  const ctx = await getSessionContext();
  if (!ctx) return { response: errorResponse("unauthenticated", "Sign in to continue.") };
  if (permission && !ctx.permissions.includes(permission)) {
    return { response: errorResponse("forbidden", "You don't have permission to do that.") };
  }
  return { ctx };
}

export async function readJson<T extends z.ZodType>(request: Request, schema: T) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return {
      response: errorResponse("validation_failed", "Check the highlighted fields.", {
        fields: parsed.error.flatten().fieldErrors,
      }),
    } as const;
  }
  return { data: parsed.data as z.infer<T> } as const;
}

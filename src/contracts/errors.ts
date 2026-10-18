export type ApiErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "validation_failed"
  | "rate_limited"
  | "internal";

export interface ApiError {
  error: { code: ApiErrorCode; message: string; requestId: string; details?: Record<string, unknown> };
}

const STATUS: Record<ApiErrorCode, number> = {
  unauthenticated: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  validation_failed: 422,
  rate_limited: 429,
  internal: 500,
};

export function errorResponse(code: ApiErrorCode, message: string, details?: Record<string, unknown>) {
  const body: ApiError = { error: { code, message, requestId: crypto.randomUUID(), details } };
  return Response.json(body, { status: STATUS[code] });
}

/** SQLSTATE values raised by our SQL functions (see the header of the identity migration). */
const SQLSTATE_TO_CODE: Record<string, ApiErrorCode> = {
  "28000": "unauthenticated",
  "42501": "forbidden",
  P0002: "not_found",
  "23505": "conflict",
  "22023": "validation_failed",
  "23503": "validation_failed", // foreign key: referenced record missing or in another workspace
  "23514": "validation_failed", // check constraint
  P0409: "conflict", // stale version or blocked change
  P0422: "validation_failed", // required stage fields missing
};

/** Maps a Postgres/PostgREST error to the API envelope without leaking internals. */
export function dbErrorResponse(err: { code?: string; message?: string; details?: string | null }) {
  const code = SQLSTATE_TO_CODE[err.code ?? ""];
  if (!code) return errorResponse("internal", "Something went wrong. Please try again.");
  const message: Record<ApiErrorCode, string> = {
    unauthenticated: "Sign in to continue.",
    forbidden: "You don't have permission to do that.",
    not_found: "That record doesn't exist or you can't access it.",
    conflict: "That conflicts with an existing record.",
    validation_failed: "Some of the information is not valid.",
    rate_limited: "Too many requests. Try again shortly.",
    internal: "Something went wrong. Please try again.",
  };
  const text: Partial<Record<string, string>> = {
    P0409: "This record changed since you opened it, or the change is blocked. Refresh and try again.",
    P0422: "Complete the required fields before moving to this stage.",
  };
  return errorResponse(code, text[err.code ?? ""] ?? message[code], parseDetails(err.details));
}

/** Our SQL functions put machine-readable JSON in the error DETAIL; anything else is ignored. */
function parseDetails(raw: string | null | undefined): Record<string, unknown> | undefined {
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

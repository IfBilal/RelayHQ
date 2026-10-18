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
};

/** Maps a Postgres/PostgREST error to the API envelope without leaking internals. */
export function dbErrorResponse(err: { code?: string; message?: string }) {
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
  return errorResponse(code, message[code]);
}

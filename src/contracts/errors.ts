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

import { createHmac, timingSafeEqual } from "node:crypto";

export type SignatureResult = { ok: true } | { ok: false; reason: "missing_header" | "malformed_header" | "stale_timestamp" | "no_match" };

/**
 * Stripe webhook signature check over the RAW body: header `t=<unix>,v1=<hex>[,v1=<hex>...]`, signed payload
 * `${t}.${rawBody}`, HMAC-SHA256 with the endpoint secret, constant-time compare, bounded clock skew (replay window).
 */
export function verifyStripeSignature(rawBody: string, header: string | null, secret: string, nowSeconds = Math.floor(Date.now() / 1000), toleranceSeconds = 300): SignatureResult {
  if (!header) return { ok: false, reason: "missing_header" };
  let timestamp = "";
  const candidates: string[] = [];
  for (const part of header.split(",")) {
    const [key, value] = part.split("=", 2);
    if (key?.trim() === "t") timestamp = value?.trim() ?? "";
    else if (key?.trim() === "v1" && value) candidates.push(value.trim());
  }
  if (!/^\d{1,12}$/.test(timestamp) || candidates.length === 0) return { ok: false, reason: "malformed_header" };
  if (Math.abs(nowSeconds - Number(timestamp)) > toleranceSeconds) return { ok: false, reason: "stale_timestamp" };

  const expected = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  const match = candidates.some((c) => {
    if (!/^[0-9a-f]{64}$/i.test(c)) return false;
    return timingSafeEqual(expected, Buffer.from(c, "hex"));
  });
  return match ? { ok: true } : { ok: false, reason: "no_match" };
}

/** Test helper and documentation of the scheme: builds a header exactly as Stripe does. */
export function signStripePayload(rawBody: string, secret: string, timestamp: number) {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

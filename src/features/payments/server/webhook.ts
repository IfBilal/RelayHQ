import { createHash } from "node:crypto";
import { stripeEventSchema } from "../schemas";
import { verifyStripeSignature } from "./stripe-signature";

/** The two database calls the webhook needs; the route injects the service-role client, tests inject fakes. */
export interface WebhookStore {
  applyEvent(args: { eventId: string; type: string; payloadHash: string; object: Record<string, unknown> }): Promise<string>;
  recordRejected(args: { payloadHash: string; reason: string }): Promise<void>;
}

export interface WebhookResult { status: number; body: Record<string, unknown> }

/**
 * Order matters: raw body -> signature -> shape -> dedupe+apply. Nothing is written before the signature verifies;
 * a rejected request leaves only a payload hash and a reason. Unknown or repeated events answer 200 so Stripe stops retrying.
 */
export async function handleStripeWebhook(rawBody: string, signatureHeader: string | null, secret: string | undefined, store: WebhookStore, now?: number): Promise<WebhookResult> {
  if (!secret) return { status: 503, body: { error: "not_configured" } };
  const payloadHash = createHash("sha256").update(rawBody, "utf8").digest("hex");

  const sig = verifyStripeSignature(rawBody, signatureHeader, secret, now);
  if (!sig.ok) {
    await store.recordRejected({ payloadHash, reason: `signature:${sig.reason}` }).catch(() => undefined);
    return { status: 400, body: { error: "invalid_signature" } };
  }

  let event;
  try {
    event = stripeEventSchema.parse(JSON.parse(rawBody));
  } catch {
    await store.recordRejected({ payloadHash, reason: "malformed_event" }).catch(() => undefined);
    return { status: 400, body: { error: "malformed_event" } };
  }

  try {
    const result = await store.applyEvent({ eventId: event.id, type: event.type, payloadHash, object: event.data.object });
    return { status: 200, body: { received: true, result } };
  } catch {
    return { status: 500, body: { error: "processing_failed" } }; // Stripe retries; the event row is not written on failure
  }
}

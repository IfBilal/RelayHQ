import "server-only";

export type StripeFailure = "stripe_not_configured" | "stripe_unreachable" | "stripe_rejected";

/** Carries a fixed code only: provider error text can contain key fragments and is never stored or shown. */
export class StripeError extends Error {
  constructor(readonly code: StripeFailure) {
    super(code);
  }
}

export interface CheckoutInput {
  requestId: string;
  amountMinor: number;
  currency: string;
  productName: string;
  successUrl: string;
  cancelUrl: string;
}

/** Form body for POST /v1/checkout/sessions. The amount comes from our DB snapshot, never from the browser. */
export function checkoutBody(i: CheckoutInput) {
  const b = new URLSearchParams();
  b.set("mode", "payment");
  b.set("success_url", i.successUrl);
  b.set("cancel_url", i.cancelUrl);
  b.set("client_reference_id", i.requestId);
  b.set("line_items[0][quantity]", "1");
  b.set("line_items[0][price_data][currency]", i.currency.toLowerCase());
  b.set("line_items[0][price_data][unit_amount]", String(i.amountMinor));
  b.set("line_items[0][price_data][product_data][name]", i.productName.slice(0, 120));
  b.set("metadata[payment_request_id]", i.requestId);
  b.set("payment_intent_data[metadata][payment_request_id]", i.requestId);
  return b;
}

/** Hosted Checkout. Called outside any DB transaction; the idempotency key makes a retry return the same session. */
export async function createCheckoutSession(i: CheckoutInput): Promise<{ id: string; url: string }> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new StripeError("stripe_not_configured");
  let res: Response;
  try {
    res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded", "idempotency-key": `relay-checkout-${i.requestId}` },
      body: checkoutBody(i),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new StripeError("stripe_unreachable");
  }
  const json = (await res.json().catch(() => ({}))) as { id?: string; url?: string; error?: { type?: string; code?: string } };
  if (!res.ok || !json.id || !json.url) {
    console.error("stripe checkout rejected", { status: res.status, type: json.error?.type, code: json.error?.code }); // no message text, no secrets
    throw new StripeError("stripe_rejected");
  }
  return { id: json.id, url: json.url };
}

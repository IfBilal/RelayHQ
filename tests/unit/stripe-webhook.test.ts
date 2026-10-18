import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { signStripePayload, verifyStripeSignature } from "@/features/payments/server/stripe-signature";
import { handleStripeWebhook, type WebhookStore } from "@/features/payments/server/webhook";
import { checkoutBody } from "@/features/payments/server/stripe";
import { paymentRequestSchema, toMinorUnits } from "@/features/payments/schemas";

const SECRET = "whsec_test_secret";
const NOW = 1_800_000_000;
const event = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ id: "evt_1ABC", type: "checkout.session.completed", data: { object: { id: "cs_test_1", payment_status: "paid", amount_total: 12500, currency: "usd" } }, ...over });

function fakeStore() {
  const seen = new Set<string>();
  const store: WebhookStore & { applied: string[]; rejected: string[] } = {
    applied: [],
    rejected: [],
    async applyEvent({ eventId }) {
      if (seen.has(eventId)) return "duplicate";
      seen.add(eventId);
      store.applied.push(eventId);
      return "processed";
    },
    async recordRejected({ reason }) {
      store.rejected.push(reason);
    },
  };
  return store;
}

describe("verifyStripeSignature", () => {
  const body = event();
  it("accepts a correctly signed payload", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, NOW), SECRET, NOW)).toEqual({ ok: true });
  });
  it("rejects a forged signature (wrong secret)", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, "whsec_attacker", NOW), SECRET, NOW)).toEqual({ ok: false, reason: "no_match" });
  });
  it("rejects an altered body", () => {
    const header = signStripePayload(body, SECRET, NOW);
    expect(verifyStripeSignature(body.replace("12500", "1"), header, SECRET, NOW)).toEqual({ ok: false, reason: "no_match" });
  });
  it("rejects a replay outside the tolerance window", () => {
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, NOW - 301), SECRET, NOW)).toEqual({ ok: false, reason: "stale_timestamp" });
    expect(verifyStripeSignature(body, signStripePayload(body, SECRET, NOW + 301), SECRET, NOW)).toEqual({ ok: false, reason: "stale_timestamp" });
  });
  it("rejects missing and malformed headers", () => {
    expect(verifyStripeSignature(body, null, SECRET, NOW)).toEqual({ ok: false, reason: "missing_header" });
    expect(verifyStripeSignature(body, "v1=abcd", SECRET, NOW)).toEqual({ ok: false, reason: "malformed_header" });
    expect(verifyStripeSignature(body, `t=${NOW},v1=zz`, SECRET, NOW)).toEqual({ ok: false, reason: "no_match" });
  });
  it("accepts when one of several v1 signatures matches (secret rotation)", () => {
    const good = signStripePayload(body, SECRET, NOW);
    expect(verifyStripeSignature(body, `${good},v1=${"0".repeat(64)}`, SECRET, NOW)).toEqual({ ok: true });
  });
});

describe("handleStripeWebhook", () => {
  it("applies a signed event exactly once and acknowledges", async () => {
    const store = fakeStore();
    const body = event();
    const header = signStripePayload(body, SECRET, NOW);
    const first = await handleStripeWebhook(body, header, SECRET, store, NOW);
    expect(first).toEqual({ status: 200, body: { received: true, result: "processed" } });
    expect(store.applied).toEqual(["evt_1ABC"]);
  });
  it("answers a repeated delivery with 200 and does not apply it twice", async () => {
    const store = fakeStore();
    const body = event();
    const header = signStripePayload(body, SECRET, NOW);
    await handleStripeWebhook(body, header, SECRET, store, NOW);
    const again = await handleStripeWebhook(body, header, SECRET, store, NOW);
    expect(again).toEqual({ status: 200, body: { received: true, result: "duplicate" } });
    expect(store.applied).toHaveLength(1);
  });
  it("rejects a forged request with 400, writes nothing but a hash/reason, and never applies it", async () => {
    const store = fakeStore();
    const body = event();
    const res = await handleStripeWebhook(body, signStripePayload(body, "whsec_attacker", NOW), SECRET, store, NOW);
    expect(res.status).toBe(400);
    expect(store.applied).toEqual([]);
    expect(store.rejected).toEqual(["signature:no_match"]);
  });
  it("rejects an altered body even with a once-valid header", async () => {
    const store = fakeStore();
    const body = event();
    const header = signStripePayload(body, SECRET, NOW);
    const res = await handleStripeWebhook(event({ id: "evt_2XYZ" }), header, SECRET, store, NOW);
    expect(res.status).toBe(400);
    expect(store.applied).toEqual([]);
  });
  it("rejects a signed but malformed event", async () => {
    const store = fakeStore();
    const body = JSON.stringify({ id: "not-an-event", type: "x", data: {} });
    const res = await handleStripeWebhook(body, signStripePayload(body, SECRET, NOW), SECRET, store, NOW);
    expect(res.status).toBe(400);
    expect(store.rejected).toEqual(["malformed_event"]);
  });
  it("fails closed when the secret is not configured", async () => {
    const store = fakeStore();
    const body = event();
    const res = await handleStripeWebhook(body, signStripePayload(body, SECRET, NOW), undefined, store, NOW);
    expect(res.status).toBe(503);
    expect(store.applied).toEqual([]);
  });
  it("returns 500 (so Stripe retries) when applying fails", async () => {
    const store = fakeStore();
    store.applyEvent = async () => {
      throw new Error("db down");
    };
    const body = event();
    const res = await handleStripeWebhook(body, signStripePayload(body, SECRET, NOW), SECRET, store, NOW);
    expect(res.status).toBe(500);
  });
});

describe("checkout request", () => {
  it("snapshots the amount in minor units and tags the request id", () => {
    const b = checkoutBody({ requestId: "r-1", amountMinor: 12500, currency: "USD", productName: "Solar install", successUrl: "https://a.test/ok", cancelUrl: "https://a.test/no" });
    expect(b.get("line_items[0][price_data][unit_amount]")).toBe("12500");
    expect(b.get("line_items[0][price_data][currency]")).toBe("usd");
    expect(b.get("client_reference_id")).toBe("r-1");
    expect(b.get("payment_intent_data[metadata][payment_request_id]")).toBe("r-1");
    expect(b.get("mode")).toBe("payment");
  });
  it("converts and validates amounts", () => {
    expect(toMinorUnits(125)).toBe(12500);
    expect(toMinorUnits(19.99)).toBe(1999);
    const id = "8d0a3c1e-6f4b-4a53-9a39-0f6f2b9d1c11";
    expect(paymentRequestSchema.safeParse({ opportunityId: id, amount: 0.1 }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ opportunityId: id, amount: 50, currency: "XXX" }).success).toBe(false);
    expect(paymentRequestSchema.safeParse({ opportunityId: id, amount: 50 }).success).toBe(true);
  });
});

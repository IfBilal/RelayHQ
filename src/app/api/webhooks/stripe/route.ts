import { createAdminClient } from "@/lib/supabase/admin";
import { handleStripeWebhook, type WebhookStore } from "@/features/payments/server/webhook";

function store(): WebhookStore {
  const admin = createAdminClient();
  return {
    async applyEvent({ eventId, type, payloadHash, object }) {
      const { data, error } = await admin.rpc("apply_stripe_event", { p_event_id: eventId, p_type: type, p_payload_hash: payloadHash, p_obj: object });
      if (error) throw new Error(error.message);
      return String(data);
    },
    async recordRejected({ payloadHash, reason }) {
      await admin.rpc("record_rejected_webhook", { p_provider: "stripe", p_payload_hash: payloadHash, p_reason: reason });
    },
  };
}

/** Signed Stripe events only. The raw body is read as text because the signature covers the exact bytes. */
export async function POST(request: Request) {
  const raw = await request.text();
  const result = await handleStripeWebhook(raw, request.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET, store());
  return Response.json(result.body, { status: result.status });
}

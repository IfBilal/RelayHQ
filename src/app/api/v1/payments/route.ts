import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { appUrl } from "@/lib/app-url";
import { paymentRequestSchema, toMinorUnits } from "@/features/payments/schemas";
import { createCheckoutSession, StripeError } from "@/features/payments/server/stripe";

/**
 * Creates a payment request and a hosted Stripe Checkout session. Three steps, none inside a DB transaction around the
 * provider call: snapshot the amount (DB) -> create the session (Stripe, idempotent) -> store it (DB). If Stripe fails the
 * request is marked failed so the failure is visible. Nothing here can mark a payment paid: only the signed webhook can.
 */
export async function POST(request: Request) {
  const guard = await requireSession("payment.create");
  if (guard.response) return guard.response;
  if (!process.env.STRIPE_SECRET_KEY) return errorResponse("internal", "Payments are not configured on this deployment.");
  const body = await readJson(request, paymentRequestSchema);
  if (body.response) return body.response;

  let base: string;
  try {
    base = appUrl();
  } catch {
    return errorResponse("internal", "APP_URL is not configured correctly on this deployment.");
  }

  const supabase = await createClient();
  const ws = guard.ctx.workspace.id;
  const created = await supabase.rpc("create_payment_request", {
    p_workspace: ws,
    p_opportunity: body.data.opportunityId,
    p_amount_minor: toMinorUnits(body.data.amount),
    p_currency: body.data.currency,
  });
  if (created.error) return dbErrorResponse(created.error);
  const requestId = created.data as string;

  const { data: opp } = await supabase.from("opportunities").select("title").eq("id", body.data.opportunityId).eq("workspace_id", ws).maybeSingle();
  try {
    const session = await createCheckoutSession({
      requestId,
      amountMinor: toMinorUnits(body.data.amount),
      currency: body.data.currency,
      productName: opp?.title ?? "Payment",
      successUrl: `${base}/payments?result=success`,
      cancelUrl: `${base}/payments?result=cancelled`,
    });
    const attached = await supabase.rpc("attach_checkout_session", { p_workspace: ws, p_request: requestId, p_session: session.id, p_url: session.url });
    if (attached.error) return dbErrorResponse(attached.error);
    return Response.json({ id: requestId, checkoutUrl: session.url }, { status: 201 });
  } catch (e) {
    const reason = e instanceof StripeError ? e.message : "provider_error";
    await supabase.rpc("fail_payment_request", { p_workspace: ws, p_request: requestId, p_reason: reason });
    return errorResponse("internal", "Stripe couldn't create the checkout session. The request is marked failed.", { requestId });
  }
}

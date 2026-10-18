import { z } from "zod";

/** Currencies with two decimal places (the amount is converted to minor units server-side). */
export const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "AED", "PKR"] as const;

export const paymentRequestSchema = z.object({
  opportunityId: z.uuid(),
  amount: z.number().min(0.5).max(999999.99).refine((a) => Math.abs(a * 100 - Math.round(a * 100)) < 1e-6, "Use at most two decimal places."),
  currency: z.enum(CURRENCIES).default("USD"),
});

export const toMinorUnits = (amount: number) => Math.round(amount * 100);

/** Only the fields the webhook applier needs from a Stripe event. */
export const stripeEventSchema = z.object({
  id: z.string().regex(/^evt_[A-Za-z0-9_]+$/),
  type: z.string().max(120),
  data: z.object({ object: z.record(z.string(), z.unknown()) }),
});

import { composeEscalationEmail } from "./compose";
import type { EmailProvider, OutboxStore } from "./types";

export interface DispatchResult {
  sent: number;
  failed: number;
  results: { id: string; ok: boolean; error?: string }[];
}

/**
 * Claims due outbox rows (leased, so overlapping runs cannot double-send), sends each outside any
 * database transaction, and records the outcome. Failures are kept visible and retried with backoff
 * by the database; one bad row never blocks the others.
 */
export async function dispatchOutbox(deps: { store: OutboxStore; email: EmailProvider; appUrl: string; limit?: number }): Promise<DispatchResult> {
  const events = await deps.store.claim(deps.limit ?? 20, 60);
  const out: DispatchResult = { sent: 0, failed: 0, results: [] };

  for (const event of events) {
    try {
      if (event.kind !== "lead.escalated") throw new Error(`Unsupported event kind: ${event.kind}`);
      const ctx = await deps.store.loadEscalation(event);
      if (!ctx) throw new Error("The lead or its new owner no longer exists.");
      if (!ctx.recipientEmail) throw new Error("The new owner has no notification email set.");
      const reason = String(event.payload.reason ?? "ACK_WINDOW_EXPIRED");
      const message = composeEscalationEmail(ctx, reason, deps.appUrl, event.idempotency_key);
      const { id } = await deps.email.send(message);
      await deps.store.finish(event.id, { ok: true, reference: id });
      out.sent++;
      out.results.push({ id: event.id, ok: true });
    } catch (err) {
      const error = err instanceof Error ? err.message : "Unknown error";
      await deps.store.finish(event.id, { ok: false, error });
      out.failed++;
      out.results.push({ id: event.id, ok: false, error });
    }
  }
  return out;
}

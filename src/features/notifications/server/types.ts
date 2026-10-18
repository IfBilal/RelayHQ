export interface OutboxEvent {
  id: string;
  workspace_id: string;
  kind: string;
  payload: Record<string, unknown>;
  idempotency_key: string;
  attempts: number;
}

export interface EscalationContext {
  leadId: string;
  contactName: string;
  source: string;
  summary: string;
  recipientEmail: string | null;
  recipientName: string | null;
}

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Provider-side deduplication so a retry after a crash does not send twice where supported. */
  idempotencyKey: string;
}

/** A provider is replaceable without touching the rules that decide what to send. */
export interface EmailProvider {
  send(message: EmailMessage): Promise<{ id: string }>;
}

/** Persistence for the dispatcher; the production implementation uses the service-role client. */
export interface OutboxStore {
  claim(limit: number, leaseSeconds: number): Promise<OutboxEvent[]>;
  finish(id: string, result: { ok: true; reference: string } | { ok: false; error: string }): Promise<void>;
  loadEscalation(event: OutboxEvent): Promise<EscalationContext | null>;
}

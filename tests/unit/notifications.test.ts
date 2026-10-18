import { describe, expect, it } from "vitest";
import { dispatchOutbox } from "@/features/notifications/server/dispatch";
import type { EmailMessage, EmailProvider, OutboxEvent, OutboxStore } from "@/features/notifications/server/types";

// Contract tests with an in-memory provider. These do NOT prove real delivery; that needs a real SMTP send.
const event = (over: Partial<OutboxEvent> = {}): OutboxEvent => ({
  id: "e1", workspace_id: "w1", kind: "lead.escalated", attempts: 1, idempotency_key: "lead.escalated:l1:2",
  payload: { lead_id: "l1", to_user_id: "u1", reason: "ACK_WINDOW_EXPIRED" }, ...over,
});

function harness(opts: { events: OutboxEvent[]; email?: string | null; fail?: boolean }) {
  const finished: Record<string, unknown> = {};
  const sent: EmailMessage[] = [];
  const store: OutboxStore = {
    claim: async () => opts.events,
    finish: async (id, r) => { finished[id] = r; },
    loadEscalation: async () => ({ leadId: "l1", contactName: "Maya Richardson", source: "web_form", summary: "Solar quote", recipientEmail: opts.email === undefined ? "sam@atlas.test" : opts.email, recipientName: "Sam" }),
  };
  const email: EmailProvider = { send: async (m) => { if (opts.fail) throw new Error("provider down"); sent.push(m); return { id: "msg_1" }; } };
  return { store, email, finished, sent };
}

describe("dispatchOutbox", () => {
  it("sends an email naming the lead, source, reason and a link, and records success", async () => {
    const h = harness({ events: [event()] });
    const r = await dispatchOutbox({ store: h.store, email: h.email, appUrl: "https://app.example.com/" });
    expect(r.sent).toBe(1);
    expect(h.sent[0].to).toBe("sam@atlas.test");
    expect(h.sent[0].text).toContain("Maya Richardson");
    expect(h.sent[0].text).toContain("Web form");
    expect(h.sent[0].text).toContain("did not acknowledge");
    expect(h.sent[0].text).toContain("https://app.example.com/leads/l1");
    expect(h.sent[0].idempotencyKey).toBe("lead.escalated:l1:2");
    expect(h.finished.e1).toEqual({ ok: true, reference: "msg_1" });
  });

  it("records a provider failure instead of throwing, so the database can retry it", async () => {
    const h = harness({ events: [event()], fail: true });
    const r = await dispatchOutbox({ store: h.store, email: h.email, appUrl: "https://x" });
    expect(r.failed).toBe(1);
    expect(h.finished.e1).toEqual({ ok: false, error: "provider down" });
  });

  it("fails visibly when the new owner has no notification email", async () => {
    const h = harness({ events: [event()], email: null });
    await dispatchOutbox({ store: h.store, email: h.email, appUrl: "https://x" });
    expect(h.sent).toHaveLength(0);
    expect(JSON.stringify(h.finished.e1)).toContain("no notification email");
  });

  it("one failing event does not stop the others", async () => {
    const h = harness({ events: [event({ id: "bad", kind: "unknown.kind" }), event({ id: "good" })] });
    const r = await dispatchOutbox({ store: h.store, email: h.email, appUrl: "https://x" });
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(1);
  });
});

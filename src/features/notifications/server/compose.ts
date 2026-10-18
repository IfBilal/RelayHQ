import type { EmailMessage, EscalationContext } from "./types";

const REASON: Record<string, string> = {
  ACK_WINDOW_EXPIRED: "The previous owner did not acknowledge it in time.",
  NO_ELIGIBLE_EMPLOYEE: "No employee was available, so it came to you as the workspace owner.",
};
const SOURCE: Record<string, string> = { web_form: "Web form", whatsapp: "WhatsApp", manual: "Manual entry" };

/** Names the lead, its source, why it escalated and a link that opens it (access is checked on open). */
export function composeEscalationEmail(ctx: EscalationContext, reason: string, appUrl: string, idempotencyKey: string): EmailMessage {
  const link = `${appUrl.replace(/\/$/, "")}/leads/${ctx.leadId}`;
  return {
    to: ctx.recipientEmail!,
    idempotencyKey,
    subject: `Lead needs you now: ${ctx.contactName}`,
    text: [
      `Hi ${ctx.recipientName ?? "there"},`,
      "",
      `A lead has been assigned to you and is waiting for a response.`,
      "",
      `Lead: ${ctx.contactName}${ctx.summary ? ` (${ctx.summary})` : ""}`,
      `Source: ${SOURCE[ctx.source] ?? ctx.source}`,
      `Why you: ${REASON[reason] ?? "It was escalated to you."}`,
      "",
      `Open the lead: ${link}`,
    ].join("\n"),
  };
}

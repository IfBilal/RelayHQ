import "server-only";
import { Resend } from "resend";
import type { EmailMessage, EmailProvider } from "./types";

/** Resend implementation. The sender must be a verified address on the account (RESEND_FROM_EMAIL). */
export function createResendProvider(): EmailProvider {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) throw new Error("RESEND_API_KEY and RESEND_FROM_EMAIL must be set.");
  const client = new Resend(apiKey);
  return {
    async send(message: EmailMessage) {
      const { data, error } = await client.emails.send(
        { from, to: message.to, subject: message.subject, text: message.text },
        { idempotencyKey: message.idempotencyKey },
      );
      if (error || !data) throw new Error(error?.message ?? "Resend rejected the message.");
      return { id: data.id };
    },
  };
}

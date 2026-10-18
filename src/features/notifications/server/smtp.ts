import "server-only";
import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "./types";

/** SMTP implementation (Gmail app password works). SMTP_FROM should be the authenticated account or an allowed alias. */
export function createSmtpProvider(): EmailProvider {
  const { SMTP_HOST: host, SMTP_PORT, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: from } = process.env;
  const port = Number(SMTP_PORT);
  if (!host || !user || !pass || !from || !Number.isInteger(port) || port <= 0) {
    throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM must be set.");
  }
  const secure = port === 465;
  const transport = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: !secure, // fail closed if STARTTLS is unavailable: never send credentials in clear
    tls: { minVersion: "TLSv1.2", servername: host },
    auth: { user, pass },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(message: EmailMessage) {
      // The key goes out as a header so a retry after a crash is detectable; SMTP itself cannot dedupe.
      const info = await transport.sendMail({
        from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        headers: { "X-Relay-Idempotency-Key": message.idempotencyKey },
      });
      return { id: info.messageId };
    },
  };
}

import "server-only";
import nodemailer from "nodemailer";
import type { EmailMessage, EmailProvider } from "./types";

/** SMTP implementation (Gmail app password works). SMTP_FROM should be the authenticated account or an allowed alias. */
export function createSmtpProvider(): EmailProvider {
  const { SMTP_HOST: host, SMTP_PORT: port, SMTP_USER: user, SMTP_PASS: pass, SMTP_FROM: from } = process.env;
  if (!host || !port || !user || !pass || !from) throw new Error("SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and SMTP_FROM must be set.");
  const transport = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
    connectionTimeout: 10_000,
    socketTimeout: 15_000,
  });
  return {
    async send(message: EmailMessage) {
      const info = await transport.sendMail({ from, to: message.to, subject: message.subject, text: message.text });
      return { id: info.messageId };
    },
  };
}

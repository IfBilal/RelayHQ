import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { createTransport } = vi.hoisted(() => ({
  createTransport: vi.fn((_opts: unknown) => ({ sendMail: async () => ({ messageId: "<id@test>" }) })),
}));
vi.mock("nodemailer", () => ({ default: { createTransport } }));

import { createSmtpProvider } from "@/features/notifications/server/smtp";

function env(port: string) {
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", port);
  vi.stubEnv("SMTP_USER", "u");
  vi.stubEnv("SMTP_PASS", "p");
  vi.stubEnv("SMTP_FROM", "alerts@example.com");
}
afterEach(() => {
  vi.unstubAllEnvs();
  createTransport.mockClear();
});

describe("createSmtpProvider", () => {
  it("uses implicit TLS on 465", () => {
    env("465");
    createSmtpProvider();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: true, requireTLS: false }));
  });
  it("requires STARTTLS on other ports so credentials are never sent in clear", () => {
    env("587");
    createSmtpProvider();
    expect(createTransport).toHaveBeenCalledWith(expect.objectContaining({ secure: false, requireTLS: true }));
  });
  it("rejects a missing or non-numeric configuration", () => {
    env("abc");
    expect(() => createSmtpProvider()).toThrow(/SMTP_/);
  });
});

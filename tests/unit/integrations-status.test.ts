import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({}) }));
import { providerConfig, safeDetail } from "@/features/integrations/server/status";

describe("safeDetail", () => {
  it("masks email addresses and truncates", () => {
    expect(safeDetail("550 5.1.1 <jane.doe@example.com> user unknown")).toBe("550 5.1.1 <[address]> user unknown");
    expect(safeDetail("a".repeat(500))?.length).toBe(140);
    expect(safeDetail(null)).toBeNull();
  });
});

describe("providerConfig", () => {
  it("reports presence only, never values", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_supersecret");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_x");
    const cfg = providerConfig();
    expect(cfg.stripe).toEqual({ configured: true, testMode: true, hasKey: true, hasWebhookSecret: true });
    expect(JSON.stringify(cfg)).not.toContain("supersecret");
    vi.unstubAllEnvs();
  });
});

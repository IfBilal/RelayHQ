import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { hashToken, newInviteToken } from "@/features/team/server/token";
import { accessSchema, inviteSchema, profileSchema, rolePermissionsSchema } from "@/features/team/schemas";

const id = "8d0a3c1e-6f4b-4a53-9a39-0f6f2b9d1c11";

describe("invite token", () => {
  it("is random and only its sha256 is derived", () => {
    const a = newInviteToken();
    const b = newInviteToken();
    expect(a.token).not.toBe(b.token);
    expect(a.token.length).toBeGreaterThanOrEqual(43);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.hash).toBe(hashToken(a.token));
    expect(a.hash).not.toContain(a.token);
  });
});

describe("team schemas", () => {
  it("cannot invite or promote to owner", () => {
    expect(inviteSchema.safeParse({ email: "a@b.co", baseRole: "owner", roleId: id }).success).toBe(false);
    expect(accessSchema.safeParse({ baseRole: "owner", roleId: id, enabled: true }).success).toBe(false);
    expect(inviteSchema.safeParse({ email: "a@b.co", baseRole: "user", roleId: id }).success).toBe(true);
  });
  it("only allows known permissions", () => {
    expect(rolePermissionsSchema.safeParse({ permissions: ["crm.view"] }).success).toBe(true);
    expect(rolePermissionsSchema.safeParse({ permissions: ["root.all"] }).success).toBe(false);
  });
  it("validates profile time zone and alert email", () => {
    const ok = { displayName: "Sam", timezone: "Asia/Karachi", notificationEmail: "" };
    expect(profileSchema.safeParse(ok).success).toBe(true);
    expect(profileSchema.parse(ok).notificationEmail).toBeNull();
    expect(profileSchema.safeParse({ ...ok, timezone: "Mars/Base" }).success).toBe(false);
    expect(profileSchema.safeParse({ ...ok, notificationEmail: "nope" }).success).toBe(false);
  });
});

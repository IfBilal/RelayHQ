import { describe, expect, it } from "vitest";
import { dbErrorResponse } from "@/contracts/errors";
import { signupSchema, slugify } from "@/features/identity/schemas";

describe("dbErrorResponse", () => {
  it.each([
    ["28000", 401],
    ["42501", 403],
    ["P0002", 404],
    ["23505", 409],
    ["22023", 422],
    ["XX000", 500],
  ])("maps SQLSTATE %s to HTTP %i without leaking the message", async (code, status) => {
    const res = dbErrorResponse({ code, message: "relation public.secret does not exist" });
    expect(res.status).toBe(status);
    expect(JSON.stringify(await res.json())).not.toContain("secret");
  });
});

describe("signupSchema", () => {
  const valid = { name: "Sam", email: "sam@atlas.test", password: "longenough", workspaceName: "Atlas", workspaceSlug: "atlas" };
  it("accepts valid input", () => expect(signupSchema.safeParse(valid).success).toBe(true));
  it("rejects short passwords and bad slugs", () => {
    expect(signupSchema.safeParse({ ...valid, password: "short" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...valid, workspaceSlug: "Bad Slug!" }).success).toBe(false);
  });
});

describe("slugify", () => {
  it("builds a valid slug from a company name", () => {
    expect(slugify("Atlas Solar & Co.")).toBe("atlas-solar-co");
  });
});

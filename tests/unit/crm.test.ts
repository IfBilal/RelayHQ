import { describe, expect, it } from "vitest";
import { dbErrorResponse } from "@/contracts/errors";
import { contactCreateSchema, contactUpdateSchema, opportunityCreateSchema, phoneSchema, toMinorUnits } from "@/features/crm/schemas";
import { formatMoney } from "@/features/crm/format";

describe("phoneSchema", () => {
  it("normalises punctuation to E.164", () => expect(phoneSchema.parse("+1 (415) 555-0184")).toBe("+14155550184"));
  it("rejects numbers without a country code", () => expect(phoneSchema.safeParse("4155550184").success).toBe(false));
});

describe("contactCreateSchema", () => {
  it("treats empty optional fields as absent", () => {
    const out = contactCreateSchema.parse({ name: "Maya", email: "", phone: "" });
    expect(out.email).toBeUndefined();
    expect(out.phone).toBeUndefined();
  });
  it("requires a name", () => expect(contactCreateSchema.safeParse({ name: "  " }).success).toBe(false));
});

describe("contactUpdateSchema", () => {
  it("needs a version and at least one change", () => {
    expect(contactUpdateSchema.safeParse({ expectedVersion: 1 }).success).toBe(false);
    expect(contactUpdateSchema.safeParse({ expectedVersion: 1, name: "New" }).success).toBe(true);
  });
});

describe("opportunityCreateSchema", () => {
  const ids = { contactId: crypto.randomUUID(), pipelineId: crypto.randomUUID(), stageId: crypto.randomUUID() };
  it("rejects negative values", () => expect(opportunityCreateSchema.safeParse({ ...ids, title: "x", value: -1 }).success).toBe(false));
  it("converts major units to integer minor units", () => {
    expect(toMinorUnits(8500)).toBe(850000);
    expect(toMinorUnits(19.99)).toBe(1999);
  });
});

describe("money formatting", () => {
  it("formats minor units", () => expect(formatMoney(850000, "USD")).toBe("$8,500"));
});

describe("dbErrorResponse for CRM codes", () => {
  it("maps stale versions to 409 and exposes structured details for missing fields", async () => {
    expect(dbErrorResponse({ code: "P0409", message: "stale version" }).status).toBe(409);
    const res = dbErrorResponse({ code: "P0422", message: "x", details: '{"fields":[{"label":"Site area"}]}' });
    expect(res.status).toBe(422);
    expect((await res.json()).error.details.fields[0].label).toBe("Site area");
  });
  it("ignores non-JSON details", async () => {
    const res = dbErrorResponse({ code: "22023", message: "x", details: "not json" });
    expect((await res.json()).error.details).toBeUndefined();
  });
});

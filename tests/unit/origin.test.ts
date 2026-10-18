import { describe, expect, it } from "vitest";
import { isCrossSiteMutation } from "@/lib/origin";

const h = (o: Record<string, string>) => new Headers(o);

describe("isCrossSiteMutation", () => {
  it("never blocks reads", () => expect(isCrossSiteMutation("GET", h({ "sec-fetch-site": "cross-site" }))).toBe(false));
  it("blocks cross-site and same-site browser writes", () => {
    expect(isCrossSiteMutation("POST", h({ "sec-fetch-site": "cross-site" }))).toBe(true);
    expect(isCrossSiteMutation("DELETE", h({ "sec-fetch-site": "same-site" }))).toBe(true);
  });
  it("allows same-origin", () => expect(isCrossSiteMutation("POST", h({ "sec-fetch-site": "same-origin" }))).toBe(false));
  it("falls back to Origin vs Host", () => {
    expect(isCrossSiteMutation("POST", h({ origin: "https://evil.test", host: "app.test" }))).toBe(true);
    expect(isCrossSiteMutation("POST", h({ origin: "https://app.test", host: "app.test" }))).toBe(false);
    expect(isCrossSiteMutation("POST", h({ origin: "null", host: "app.test" }))).toBe(true);
  });
  it("allows non-browser clients with no origin headers", () => expect(isCrossSiteMutation("POST", h({}))).toBe(false));
});

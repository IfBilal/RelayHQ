import { describe, expect, it } from "vitest";
import { safeNext } from "@/lib/safe-next";

const origin = "https://app.example.com";

describe("safeNext", () => {
  it.each(["//evil.com", "/\\evil.com", "/.//evil.com", "/a/..//evil.com", "javascript:alert(1)", "https://evil.com", "http://app.example.com.evil.com/", "/\t/evil.com", ""])(
    "rejects %j",
    (bad) => expect(safeNext(bad, origin)).toBe("/dashboard"),
  );
  it("rejects undefined", () => expect(safeNext(undefined, origin)).toBe("/dashboard"));
  it("keeps same-site paths with query and hash", () => {
    expect(safeNext("/team", origin)).toBe("/team");
    expect(safeNext("/invite?token=abc_-123", origin)).toBe("/invite?token=abc_-123");
    expect(safeNext("/leads?created=today#x", origin)).toBe("/leads?created=today#x");
  });
});

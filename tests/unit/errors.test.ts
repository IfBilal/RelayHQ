import { describe, expect, it } from "vitest";
import { errorResponse } from "@/contracts/errors";

describe("errorResponse", () => {
  it("maps codes to HTTP status and envelope", async () => {
    const res = errorResponse("forbidden", "No access");
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("forbidden");
  });
});

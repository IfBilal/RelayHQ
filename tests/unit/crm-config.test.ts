import { describe, expect, it } from "vitest";
import { fieldSchema, reorderSchema, requiredFieldsSchema } from "@/features/crm/config-schemas";

const id = "8d0a3c1e-6f4b-4a53-9a39-0f6f2b9d1c11";

describe("crm config schemas", () => {
  it("accepts a pipeline-scoped and a workspace-wide field", () => {
    expect(fieldSchema.safeParse({ pipelineId: id, key: "roof_type", label: "Roof type", type: "text" }).success).toBe(true);
    expect(fieldSchema.safeParse({ pipelineId: null, key: "budget", label: "Budget", type: "number" }).success).toBe(true);
  });
  it("rejects bad keys, unknown types and empty dropdowns", () => {
    expect(fieldSchema.safeParse({ pipelineId: null, key: "Bad Key", label: "x", type: "text" }).success).toBe(false);
    expect(fieldSchema.safeParse({ pipelineId: null, key: "k", label: "x", type: "formula" }).success).toBe(false);
    expect(fieldSchema.safeParse({ pipelineId: null, key: "k", label: "x", type: "dropdown", options: [] }).success).toBe(false);
    expect(fieldSchema.safeParse({ pipelineId: null, key: "k", label: "x", type: "dropdown", options: ["a"] }).success).toBe(true);
  });
  it("validates stage order and required field ids as uuids", () => {
    expect(reorderSchema.safeParse({ order: [id] }).success).toBe(true);
    expect(reorderSchema.safeParse({ order: ["nope"] }).success).toBe(false);
    expect(requiredFieldsSchema.safeParse({ fields: [] }).success).toBe(true);
    expect(requiredFieldsSchema.safeParse({ fields: ["1; drop table"] }).success).toBe(false);
  });
});

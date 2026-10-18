import { z } from "zod";

const name = z.string().trim().min(1).max(80);

export const pipelineSchema = z.object({ name });
export const stageSchema = z.object({ name });
export const reorderSchema = z.object({ order: z.array(z.uuid()).min(1).max(50) });
export const requiredFieldsSchema = z.object({ fields: z.array(z.uuid()).max(50) });

export const fieldSchema = z
  .object({
    pipelineId: z.uuid().nullable(),
    key: z.string().trim().regex(/^[a-z][a-z0-9_]{0,39}$/, "Use lowercase letters, numbers and underscores, starting with a letter."),
    label: name,
    type: z.enum(["text", "number", "date", "dropdown", "checkbox"]),
    options: z.array(z.string().trim().min(1).max(80)).max(50).default([]).transform((o) => [...new Set(o)]),
    help: z.string().trim().max(200).optional(),
  })
  .refine((f) => f.type !== "dropdown" || f.options.length > 0, { message: "Add at least one option.", path: ["options"] });

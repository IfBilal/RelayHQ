import { z } from "zod";

export const slugSchema = z
  .string()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "Use 3–40 lowercase letters, numbers or hyphens.");

export const signupSchema = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email().max(254),
  password: z.string().min(8).max(72),
  workspaceName: z.string().trim().min(1).max(80),
  workspaceSlug: slugSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(72),
});
export type LoginInput = z.infer<typeof loginSchema>;

export function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

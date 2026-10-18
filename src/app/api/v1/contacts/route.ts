import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { contactCreateSchema, contactListQuerySchema } from "@/features/crm/schemas";
import { createContact, listContacts } from "@/features/crm/server/contacts";

export async function GET(request: Request) {
  const guard = await requireSession("crm.view");
  if (guard.response) return guard.response;
  const parsed = contactListQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return errorResponse("validation_failed", "Invalid query.");
  const result = await listContacts(guard.ctx, parsed.data);
  if (result.error) return dbErrorResponse(result.error);
  return Response.json(result);
}

export async function POST(request: Request) {
  const guard = await requireSession("crm.create");
  if (guard.response) return guard.response;
  const body = await readJson(request, contactCreateSchema);
  if (body.response) return body.response;
  const result = await createContact(guard.ctx, body.data);
  if (result.error) {
    if (result.error.code === "23505") return errorResponse("conflict", "A contact with that phone number already exists.");
    return dbErrorResponse(result.error);
  }
  return Response.json(result.contact, { status: 201 });
}

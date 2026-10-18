import { z } from "zod";
import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { contactUpdateSchema } from "@/features/crm/schemas";
import { getContact360, updateContact } from "@/features/crm/server/contacts";

const idSchema = z.uuid();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession("crm.view");
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return errorResponse("not_found", "That contact doesn't exist or you can't access it.");
  const data = await getContact360(guard.ctx, id);
  if (!data) return errorResponse("not_found", "That contact doesn't exist or you can't access it.");
  return Response.json(data);
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireSession("crm.edit");
  if (guard.response) return guard.response;
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return errorResponse("not_found", "That contact doesn't exist or you can't access it.");
  const body = await readJson(request, contactUpdateSchema);
  if (body.response) return body.response;
  const result = await updateContact(guard.ctx, id, body.data);
  if (result.error) {
    if (result.error.code === "23505") return errorResponse("conflict", "A contact with that phone number already exists.");
    return dbErrorResponse(result.error);
  }
  if (result.notFound) return errorResponse("not_found", "That contact doesn't exist or you can't access it.");
  if (result.stale) return errorResponse("conflict", "This contact changed since you opened it. Refresh and try again.");
  return Response.json(result.contact);
}

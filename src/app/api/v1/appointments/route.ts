import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { bookAppointmentSchema } from "@/features/calendar/schemas";
import { accessTokenFor, GoogleError, insertEvent, isBusy } from "@/features/calendar/server/google";

/**
 * Book: local hold (DB, overlap-checked) -> FreeBusy on the employee's Google calendar -> insert event -> confirm (DB).
 * Provider calls happen outside any DB transaction. If Google refuses, the appointment is marked error, never confirmed.
 */
export async function POST(request: Request) {
  const guard = await requireSession("appointment.create");
  if (guard.response) return guard.response;
  const body = await readJson(request, bookAppointmentSchema);
  if (body.response) return body.response;
  const { contactId, employeeUserId, purpose, startsAt, durationMinutes, timezone } = body.data;
  const start = new Date(startsAt);
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  const ws = guard.ctx.workspace.id;
  const supabase = await createClient();

  let token: string | null;
  try {
    token = await accessTokenFor(ws, employeeUserId);
  } catch (e) {
    return errorResponse("conflict", e instanceof Error ? e.message : "Google Calendar is unavailable.");
  }
  if (!token) return errorResponse("validation_failed", "That employee has not connected their Google Calendar yet.", { fields: { employeeUserId: ["Calendar not connected"] } });

  try {
    if (await isBusy(token, start.toISOString(), end.toISOString())) {
      return errorResponse("conflict", "That time is already blocked on the employee's Google Calendar. Pick another slot.");
    }
  } catch (e) {
    return errorResponse("internal", e instanceof GoogleError ? e.message : "Google FreeBusy check failed.");
  }

  const booked = await supabase.rpc("book_appointment", {
    p_workspace: ws, p_contact: contactId, p_employee: employeeUserId, p_purpose: purpose,
    p_starts: start.toISOString(), p_ends: end.toISOString(), p_tz: timezone,
  });
  if (booked.error) return dbErrorResponse(booked.error);
  const id = booked.data as string;

  const { data: contact } = await supabase.from("contacts").select("name, email, phone").eq("id", contactId).eq("workspace_id", ws).maybeSingle();
  try {
    // re-check immediately before insert (Google has no lock)
    if (await isBusy(token, start.toISOString(), end.toISOString())) throw new GoogleError("Slot was taken on Google Calendar while booking.");
    const eventId = await insertEvent(token, {
      summary: `${purpose} · ${contact?.name ?? "Customer"}`,
      description: `RelayHQ appointment for ${contact?.name ?? "customer"}${contact?.email ? ` (${contact.email})` : ""}${contact?.phone ? ` ${contact.phone}` : ""}.`,
      startIso: start.toISOString(), endIso: end.toISOString(), tz: timezone,
    });
    const done = await supabase.rpc("finish_appointment", { p_workspace: ws, p_id: id, p_status: "confirmed", p_event_id: eventId, p_error: null });
    if (done.error) return dbErrorResponse(done.error);
    return Response.json({ id, googleEventId: eventId }, { status: 201 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "provider_error";
    await supabase.rpc("finish_appointment", { p_workspace: ws, p_id: id, p_status: "error", p_event_id: null, p_error: msg });
    return errorResponse("internal", `Google Calendar did not accept the event: ${msg}`, { id });
  }
}

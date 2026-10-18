import { dbErrorResponse, errorResponse } from "@/contracts/errors";
import { readJson, requireSession } from "@/lib/api";
import { createClient } from "@/lib/supabase/server";
import { rescheduleSchema } from "@/features/calendar/schemas";
import { accessTokenFor, deleteEvent, isBusy, patchEvent } from "@/features/calendar/server/google";

type Ctx = { params: Promise<{ id: string }> };

async function load(ws: string, id: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("appointments").select("id, employee_user_id, google_event_id, status, timezone").eq("workspace_id", ws).eq("id", id).maybeSingle();
  return data;
}

/** Reschedule: FreeBusy check, DB move (overlap-checked), then Google patch. */
export async function PATCH(request: Request, { params }: Ctx) {
  const guard = await requireSession("appointment.create");
  if (guard.response) return guard.response;
  const { id } = await params;
  const body = await readJson(request, rescheduleSchema);
  if (body.response) return body.response;
  const ws = guard.ctx.workspace.id;
  const appt = await load(ws, id);
  if (!appt || !["pending", "confirmed"].includes(appt.status)) return errorResponse("not_found", "Appointment not found.");
  const start = new Date(body.data.startsAt);
  const end = new Date(start.getTime() + body.data.durationMinutes * 60_000);
  let token: string | null = null;
  try {
    token = await accessTokenFor(ws, appt.employee_user_id);
    if (token && (await isBusy(token, start.toISOString(), end.toISOString()))) {
      return errorResponse("conflict", "That time is blocked on the employee's Google Calendar.");
    }
  } catch (e) {
    return errorResponse("internal", e instanceof Error ? e.message : "Google Calendar is unavailable.");
  }
  const supabase = await createClient();
  const moved = await supabase.rpc("reschedule_appointment", { p_workspace: ws, p_id: id, p_starts: start.toISOString(), p_ends: end.toISOString() });
  if (moved.error) return dbErrorResponse(moved.error);
  if (token && appt.google_event_id) {
    try {
      await patchEvent(token, appt.google_event_id, { startIso: start.toISOString(), endIso: end.toISOString(), tz: appt.timezone });
      await supabase.rpc("finish_appointment", { p_workspace: ws, p_id: id, p_status: "confirmed", p_event_id: null, p_error: null });
    } catch (e) {
      await supabase.rpc("finish_appointment", { p_workspace: ws, p_id: id, p_status: "error", p_event_id: null, p_error: e instanceof Error ? e.message : "provider_error" });
      return errorResponse("internal", "Moved locally but Google Calendar rejected the change; the appointment is flagged.");
    }
  }
  return Response.json({ ok: true });
}

/** Cancel: Google delete first (idempotent on 404/410), then local state + audit. */
export async function DELETE(_request: Request, { params }: Ctx) {
  const guard = await requireSession("appointment.create");
  if (guard.response) return guard.response;
  const { id } = await params;
  const ws = guard.ctx.workspace.id;
  const appt = await load(ws, id);
  if (!appt) return errorResponse("not_found", "Appointment not found.");
  if (appt.google_event_id) {
    try {
      const token = await accessTokenFor(ws, appt.employee_user_id);
      if (token) await deleteEvent(token, appt.google_event_id);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (!/not found|410|deleted/i.test(msg)) return errorResponse("internal", `Google Calendar did not remove the event: ${msg || "provider_error"}`);
    }
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("finish_appointment", { p_workspace: ws, p_id: id, p_status: "cancelled", p_event_id: null, p_error: null });
  if (error) return dbErrorResponse(error);
  return Response.json({ ok: true });
}

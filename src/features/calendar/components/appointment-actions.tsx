"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/relay/toast";

export function AppointmentActions({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  if (status === "cancelled") return null;

  async function cancel() {
    if (!confirm("Cancel this appointment and remove it from Google Calendar?")) return;
    setBusy(true);
    const res = await fetch(`/api/v1/appointments/${id}`, { method: "DELETE" });
    const json = await res.json().catch(() => ({}));
    toast(res.ok ? "Appointment cancelled." : json?.error?.message ?? "Couldn't cancel.");
    setBusy(false);
    router.refresh();
  }
  async function reschedule() {
    const when = prompt("New start (YYYY-MM-DDTHH:MM, UTC):");
    if (!when) return;
    const d = new Date(when + ":00Z");
    if (Number.isNaN(d.getTime())) { toast("Invalid date."); return; }
    setBusy(true);
    const res = await fetch(`/api/v1/appointments/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ startsAt: d.toISOString(), durationMinutes: 30 }) });
    const json = await res.json().catch(() => ({}));
    toast(res.ok ? "Rescheduled." : json?.error?.message ?? "Couldn't reschedule.");
    setBusy(false);
    router.refresh();
  }
  return (
    <span style={{ display: "inline-flex", gap: 6 }}>
      <button type="button" className="btn small" disabled={busy} onClick={reschedule}>Reschedule</button>
      <button type="button" className="btn small" disabled={busy} onClick={cancel}>Cancel</button>
    </span>
  );
}

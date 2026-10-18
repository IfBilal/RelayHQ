"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/components/relay/icons";
import { useToast } from "@/components/relay/toast";

interface Props {
  contacts: { id: string; name: string }[];
  employees: { id: string; name: string; connected: boolean }[];
  timezone: string;
  defaultEmployee: string;
}

export function BookingForm({ contacts, employees, timezone, defaultEmployee }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const local = `${f.get("date")}T${f.get("time")}:00`;
    // Interpret the chosen wall-clock time in the workspace zone: compute the offset via Intl.
    const startsAt = zonedToIso(local, timezone);
    setBusy(true); setError(null);
    try {
      const res = await fetch("/api/v1/appointments", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: f.get("contactId"), employeeUserId: f.get("employeeUserId"), purpose: f.get("purpose"), startsAt, durationMinutes: Number(f.get("duration")), timezone }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) { setError(json?.error?.message ?? "Couldn't book the appointment."); return; }
      toast("Booked on Google Calendar.");
      (e.target as HTMLFormElement).reset?.();
      router.refresh();
    } catch { setError("Network error. Try again."); } finally { setBusy(false); }
  }

  const today = new Date().toISOString().slice(0, 10);
  return (
    <form onSubmit={submit} className="stack">
      <label htmlFor="bk-contact">Customer</label>
      <select id="bk-contact" name="contactId" className="cal-input" required defaultValue="">
        <option value="" disabled>Select a customer</option>
        {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <label htmlFor="bk-emp">Assigned employee</label>
      <select id="bk-emp" name="employeeUserId" className="cal-input" required defaultValue={defaultEmployee}>
        {employees.map((m) => <option key={m.id} value={m.id}>{m.name}{m.connected ? "" : " (calendar not connected)"}</option>)}
      </select>
      <label htmlFor="bk-date">Appointment date</label>
      <input id="bk-date" name="date" type="date" className="cal-input" required min={today} defaultValue={today} />
      <label htmlFor="bk-time">Start time ({timezone})</label>
      <input id="bk-time" name="time" type="time" className="cal-input" required defaultValue="11:00" step={900} />
      <label htmlFor="bk-dur">Duration</label>
      <select id="bk-dur" name="duration" className="cal-input" defaultValue="30">
        {[15, 30, 45, 60, 90, 120].map((d) => <option key={d} value={d}>{d} minutes</option>)}
      </select>
      <label htmlFor="bk-purpose">Meeting purpose</label>
      <input id="bk-purpose" name="purpose" className="cal-input" required maxLength={120} placeholder="Discovery call" />
      {error && <p role="alert" className="form-error">{error}</p>}
      <button type="submit" className="btn primary" disabled={busy}>
        {busy ? "Checking availability…" : <>Book on Google Calendar <Icon name="arrow" /></>}
      </button>
    </form>
  );
}

/** Converts a wall-clock datetime in an IANA zone to an ISO instant (two-pass offset resolution). */
function zonedToIso(local: string, tz: string) {
  const naive = new Date(local + "Z");
  const offset = (d: Date) => {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" }).formatToParts(d);
    const g = (t: string) => Number(parts.find((p) => p.type === t)?.value);
    return Date.UTC(g("year"), g("month") - 1, g("day"), g("hour"), g("minute"), g("second")) - d.getTime();
  };
  let guess = new Date(naive.getTime() - offset(naive));
  guess = new Date(naive.getTime() - offset(guess));
  return guess.toISOString();
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function LeadForm({ contacts }: { contacts: { id: string; name: string }[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch("/api/v1/leads", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ contactId: f.contactId, summary: f.summary }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setMessage(json?.error?.message ?? "Something went wrong.");
      router.push(`/leads/${json.id}`);
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="card rule-form" style={{ maxWidth: 640, display: "grid", gap: 18 }}>
      <div>
        <label htmlFor="contactId" className="formlabel">Contact</label>
        <select id="contactId" name="contactId" required className="cal-input" style={{ width: "100%", margin: 0 }}>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor="summary" className="formlabel">What do they need?</label>
        <input id="summary" name="summary" maxLength={500} className="cal-input" style={{ width: "100%", margin: 0 }} placeholder="Solar consultation request" />
      </div>
      <p className="helptext">The lead goes to the next available employee. If nobody is available it goes to the workspace owner.</p>
      {message && <p role="alert" className="notice-main" style={{ color: "var(--coral)" }}>{message}</p>}
      <div>
        <button type="submit" className="btn primary" disabled={busy}>{busy ? "Assigning…" : "Capture lead"}</button>
      </div>
    </form>
  );
}

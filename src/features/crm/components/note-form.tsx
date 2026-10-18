"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NoteForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const body = String(new FormData(form).get("body") ?? "").trim();
    if (!body) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json?.error?.message ?? "Couldn't save the note.");
        return;
      }
      form.reset();
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ marginBottom: 18 }}>
      <label htmlFor="note-body" className="formlabel">
        Add a note
      </label>
      <textarea id="note-body" name="body" rows={3} maxLength={4000} className="cal-input" style={{ width: "100%", height: "auto", padding: 10, margin: "0 0 8px" }} />
      {error && (
        <p role="alert" className="helptext" style={{ color: "var(--coral)" }}>
          {error}
        </p>
      )}
      <button type="submit" className="btn small primary" disabled={busy}>
        {busy ? "Saving…" : "Save note"}
      </button>
    </form>
  );
}

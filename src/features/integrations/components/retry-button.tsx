"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ eventId, label }: { eventId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  async function retry() {
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/v1/integrations/outbox/${eventId}/retry`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: "Queued again." } : { ok: false, text: res.status === 429 ? "Retried a moment ago. Try again in a minute." : (json?.error?.message ?? "Couldn't retry.") });
    } catch {
      setMessage({ ok: false, text: "We couldn't reach the server." });
    }
    setBusy(false);
    router.refresh();
  }
  return (
    <span>
      <button type="button" className="btn" disabled={busy} onClick={retry} aria-label={label}>{busy ? "Retrying…" : "Retry"}</button>
      <span role={message?.ok === false ? "alert" : "status"} aria-live="polite" style={{ marginLeft: 8, fontSize: 11, color: message?.ok === false ? "var(--coral)" : undefined }}>{message?.text}</span>
    </span>
  );
}

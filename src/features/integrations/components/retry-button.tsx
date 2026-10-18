"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function RetryButton({ eventId }: { eventId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function retry() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/integrations/outbox/${eventId}/retry`, { method: "POST" });
      if (!res.ok) setError((await res.json().catch(() => ({})))?.error?.message ?? "Couldn't retry.");
    } catch {
      setError("We couldn't reach the server.");
    }
    setBusy(false);
    router.refresh();
  }
  return (
    <span>
      <button type="button" className="btn" disabled={busy} onClick={retry} aria-label="Retry this alert">{busy ? "Retrying…" : "Retry"}</button>
      {error && <span role="alert" style={{ color: "var(--coral)", marginLeft: 8, fontSize: 11 }}>{error}</span>}
    </span>
  );
}

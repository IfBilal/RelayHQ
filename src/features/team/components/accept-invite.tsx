"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function AcceptInvite({ token, email }: { token: string; email: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/team/invitations/accept", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(res.status === 404 ? "This invitation is invalid, expired or was already used." : (json?.error?.message ?? "Couldn't accept the invitation."));
        setBusy(false);
        return;
      }
      router.replace("/dashboard");
      router.refresh();
    } catch {
      setError("We couldn't reach the server.");
      setBusy(false);
    }
  }

  return (
    <>
      <p className="subline">You are signed in as <b>{email}</b>. The invitation only works for the email address it was sent to.</p>
      <button type="button" className="btn primary" style={{ marginTop: 16 }} onClick={accept} disabled={busy}>{busy ? "Joining…" : "Accept invitation"}</button>
      {error && <p role="alert" style={{ marginTop: 10, color: "var(--coral)" }}>{error}</p>}
    </>
  );
}

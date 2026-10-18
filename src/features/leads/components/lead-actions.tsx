"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

async function call(url: string, method: string, body: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, message: (json?.error?.message as string | undefined) ?? "Something went wrong. Please try again." };
}

export function AcknowledgeButton({ leadId, version, small = true }: { leadId: string; version: number; small?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span>
      <button
        type="button"
        className={`btn primary${small ? " small" : ""}`}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          const r = await call(`/api/v1/leads/${leadId}/acknowledge`, "POST", { expectedVersion: version }).catch(() => null);
          setBusy(false);
          if (!r) return setError("We couldn't reach the server. Try again.");
          if (!r.ok) setError(r.status === 409 ? "This lead has a new owner or changed. Refresh to see the latest." : r.message);
          router.refresh();
        }}
      >
        {busy ? "Saving…" : "Acknowledge"}
      </button>
      {error && (
        <span role="alert" className="helptext" style={{ display: "block", color: "var(--coral)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

export function ReassignControl({ leadId, version, currentOwner, members }: {
  leadId: string;
  version: number;
  currentOwner: string;
  members: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <span style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      <label className="sr-only" htmlFor={`reassign-${leadId}`}>
        Reassign to
      </label>
      <select
        id={`reassign-${leadId}`}
        className="cal-input"
        style={{ margin: 0, height: 31, fontSize: 11, width: 150 }}
        defaultValue=""
        disabled={busy}
        onChange={async (e) => {
          const ownerUserId = e.target.value;
          if (!ownerUserId) return;
          setBusy(true);
          setError(null);
          const r = await call(`/api/v1/leads/${leadId}/reassign`, "POST", { ownerUserId, expectedVersion: version }).catch(() => null);
          setBusy(false);
          if (!r) setError("We couldn't reach the server. Try again.");
          else if (!r.ok) setError(r.status === 409 ? "This lead changed. Refresh to see the latest." : r.message);
          router.refresh();
        }}
      >
        <option value="">Reassign…</option>
        {members.filter((m) => m.id !== currentOwner).map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="helptext" style={{ color: "var(--coral)" }}>
          {error}
        </span>
      )}
    </span>
  );
}

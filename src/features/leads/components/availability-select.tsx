"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const OPTIONS = [
  ["available", "Available"],
  ["busy", "Busy"],
  ["on_leave", "On leave"],
  ["offline", "Offline"],
] as const;

/** Sets the signed-in member's status; going On leave or Offline moves their unacknowledged leads at once. */
export function AvailabilitySelect({ value, userId = "me", label = "My status" }: { value: string; userId?: string; label?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <label style={{ display: "inline-flex", flexDirection: "column", gap: 2, fontSize: 11 }}>
      <span className="sr-only">{label}</span>
      <select
        className="cal-input"
        style={{ margin: 0, height: 32, width: 112, fontSize: 11 }}
        value={value}
        disabled={busy}
        aria-label={label}
        onChange={async (e) => {
          setBusy(true);
          setError(null);
          try {
            const res = await fetch(`/api/v1/team/${userId}/availability`, {
              method: "PATCH",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ status: e.target.value }),
            });
            if (!res.ok) setError((await res.json().catch(() => ({})))?.error?.message ?? "Couldn't change status.");
          } catch {
            setError("We couldn't reach the server.");
          }
          setBusy(false);
          router.refresh();
        }}
      >
        {OPTIONS.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" style={{ color: "var(--coral)" }}>
          {error}
        </span>
      )}
    </label>
  );
}

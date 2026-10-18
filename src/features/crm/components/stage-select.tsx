"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StageRow } from "../types";

/** Keyboard-accessible "Move to stage" control; the server enforces required fields and versions. */
export function StageSelect({ opportunityId, version, stageId, stages, label }: {
  opportunityId: string;
  version: number;
  stageId: string;
  stages: StageRow[];
  label: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function move(target: string) {
    if (target === stageId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/opportunities/${opportunityId}/stage`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetStageId: target, expectedVersion: version }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const fields = (json?.error?.details?.fields ?? []) as { label: string }[];
        setError(fields.length ? `Fill in ${fields.map((f) => f.label).join(", ")} first.` : (json?.error?.message ?? "Couldn't move this opportunity."));
      }
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 10 }}>
      <label className="label-kpi" style={{ display: "block", marginBottom: 4 }}>
        {label}
        <select
          className="cal-input"
          style={{ width: "100%", margin: "4px 0 0", height: 32, fontSize: 11 }}
          value={stageId}
          disabled={busy}
          onChange={(e) => move(e.target.value)}
        >
          {stages.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </label>
      {error && (
        <p role="alert" className="helptext" style={{ color: "var(--coral)" }}>
          {error}
        </p>
      )}
    </div>
  );
}

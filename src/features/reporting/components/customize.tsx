"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { WIDGETS, type WidgetKey } from "../types";

export function CustomizeDashboard({ hidden, available }: { hidden: WidgetKey[]; available: WidgetKey[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState<Set<WidgetKey>>(new Set(available.filter((k) => !hidden.includes(k))));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      const hiddenWidgets = available.filter((k) => !shown.has(k));
      const res = await fetch("/api/v1/dashboard/preferences", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ hiddenWidgets }) });
      if (!res.ok) return setError("Couldn't save your choice. Try again.");
      setOpen(false);
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ position: "relative" }}>
      <button type="button" className="btn" aria-expanded={open} onClick={() => setOpen((o) => !o)}>Customize</button>
      {open && (
        <div role="dialog" aria-label="Choose dashboard figures" className="card" style={{ position: "absolute", right: 0, top: 44, zIndex: 40, width: 280, padding: 16, boxShadow: "0 12px 30px rgba(20,43,53,.18)" }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="formlabel">Show on my dashboard</legend>
            {WIDGETS.filter((w) => available.includes(w.key)).map((w) => (
              <label key={w.key} style={{ display: "flex", gap: 8, alignItems: "center", padding: "6px 0", fontSize: 12 }}>
                <input type="checkbox" checked={shown.has(w.key)} onChange={(e) => setShown((s) => { const n = new Set(s); if (e.target.checked) n.add(w.key); else n.delete(w.key); return n; })} />
                {w.label}
              </label>
            ))}
          </fieldset>
          {error && <p role="alert" className="helptext" style={{ color: "var(--coral)" }}>{error}</p>}
          <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
            <button type="button" className="btn small primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className="btn small" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

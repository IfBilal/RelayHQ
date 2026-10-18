"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ProfileForm({ initial }: { initial: { displayName: string; timezone: string; notificationEmail: string; accountEmail: string } }) {
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/v1/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ displayName: v.displayName, timezone: v.timezone, notificationEmail: v.notificationEmail || null }),
      });
      const json = await res.json().catch(() => ({}));
      setMsg(res.ok ? { ok: true, text: "Profile saved." } : { ok: false, text: json?.error?.message ?? "Couldn't save your profile." });
      if (res.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "We couldn't reach the server." });
    }
    setBusy(false);
  }

  const field = { width: "100%", margin: 0 } as const;
  return (
    <form onSubmit={save} className="card panel" style={{ maxWidth: 560 }}>
      <h2>Your profile</h2>
      <div style={{ marginTop: 14 }}>
        <label className="formlabel" htmlFor="p-name">Display name</label>
        <input id="p-name" required maxLength={80} value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} className="cal-input" style={field} />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="formlabel" htmlFor="p-tz">Time zone (IANA, e.g. Asia/Karachi)</label>
        <input id="p-tz" required maxLength={64} value={v.timezone} onChange={(e) => setV({ ...v, timezone: e.target.value })} className="cal-input" style={field} />
      </div>
      <div style={{ marginTop: 14 }}>
        <label className="formlabel" htmlFor="p-mail">Alert email (escalation alerts are sent here; defaults to {initial.accountEmail})</label>
        <input id="p-mail" type="email" maxLength={254} value={v.notificationEmail} onChange={(e) => setV({ ...v, notificationEmail: e.target.value })} className="cal-input" style={field} />
      </div>
      <button type="submit" className="btn primary" style={{ marginTop: 18 }} disabled={busy}>{busy ? "Saving…" : "Save profile"}</button>
      {msg && <p role={msg.ok ? "status" : "alert"} style={{ marginTop: 10, fontSize: 12, color: msg.ok ? "var(--green, #2f7d5b)" : "var(--coral)" }}>{msg.text}</p>}
    </form>
  );
}

"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AssignmentRules } from "../types";

interface Member {
  id: string;
  name: string;
}

const LEVEL_LABEL = (i: number, alternates: number) =>
  i === 0 ? "Primary available employee"
  : i <= alternates ? `Alternate employee ${alternates > 1 ? i : ""}`.trim()
  : i === alternates + 1 ? "Designated backup"
  : i === alternates + 2 ? "Manager"
  : "Owner (final fallback)";

export function RulesForm({ rules, members, canEdit }: { rules: AssignmentRules; members: Member[]; canEdit: boolean }) {
  const router = useRouter();
  const [alternates, setAlternates] = useState(rules.alternate_levels);
  const [windows, setWindows] = useState<number[]>(rules.windows_seconds);
  const [maxOpen, setMaxOpen] = useState(rules.max_open_leads);
  const [backup, setBackup] = useState(rules.backup_user_id ?? "");
  const [manager, setManager] = useState(rules.manager_user_id ?? "");
  const [idle, setIdle] = useState(rules.idle_seconds);
  const [onAbsence, setOnAbsence] = useState(rules.reassign_on_absence);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const rows = Math.min(8, alternates + 4);
  const windowAt = (i: number) => windows[Math.min(i, windows.length - 1)] ?? 30;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/v1/assignment/rules", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          maxOpenLeads: maxOpen,
          windowsSeconds: Array.from({ length: rows }, (_, i) => windowAt(i)),
          alternateLevels: alternates,
          backupUserId: backup || null,
          managerUserId: manager || null,
          idleSeconds: idle,
          reassignOnAbsence: onAbsence,
        }),
      });
      const json = await res.json().catch(() => ({}));
      setMessage(res.ok ? { ok: true, text: "Rules saved. New leads use them immediately." } : { ok: false, text: json?.error?.message ?? "Couldn't save the rules." });
      if (res.ok) router.refresh();
    } catch {
      setMessage({ ok: false, text: "We couldn't reach the server. Try again." });
    } finally {
      setBusy(false);
    }
  }

  const num = (id: string, label: string, value: number, set: (n: number) => void, help?: string, min = 1) => (
    <div>
      <label className="formlabel" htmlFor={id}>{label}</label>
      <input id={id} type="number" min={min} value={value} disabled={!canEdit} onChange={(e) => set(Number(e.target.value))} className="cal-input" style={{ width: "100%", margin: 0 }} />
      {help && <div className="helptext">{help}</div>}
    </div>
  );
  const memberSelect = (id: string, label: string, value: string, set: (v: string) => void) => (
    <div>
      <label className="formlabel" htmlFor={id}>{label}</label>
      <select id={id} value={value} disabled={!canEdit} onChange={(e) => set(e.target.value)} className="cal-input" style={{ width: "100%", margin: 0 }}>
        <option value="">Not set</option>
        {members.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  );

  return (
    <form onSubmit={save} className="card rule-form">
      <div className="block-heading"><h2>Default assignment policy</h2><span className="chip slate">Workspace default</span></div>
      <div className="formrow">
        <div>
          <span className="formlabel">Distribution method</span>
          <div className="fake-select">Round robin</div>
          <div className="helptext">Rotate evenly among available team members.</div>
        </div>
        {num("max-open", "Open leads per employee", maxOpen, setMaxOpen, "Busy, on leave and offline are excluded.")}
      </div>
      <div className="formrow">
        {num("alternates", "Alternate employees before the backup", alternates, (n) => setAlternates(Math.max(0, Math.min(4, n))), "0 to 4 employees are tried before the designated backup.", 0)}
        {num("idle", "Idle threshold (seconds)", idle, setIdle, "Leads with no recorded action for this long appear in the recovery queue.", 10)}
      </div>
      <div className="formrow">
        {memberSelect("backup", "Designated backup", backup, setBackup)}
        {memberSelect("manager", "Manager", manager, setManager)}
      </div>

      <div className="rule-line" />
      <div className="block-heading"><h2>Escalation ladder</h2><span className="label-kpi">Time allowed per level, in seconds</span></div>
      <div className="ladder">
        {Array.from({ length: rows }, (_, i) => (
          <div className="step" key={i}>
            <span className="step-num">{i + 1}</span>
            <b>{LEVEL_LABEL(i, alternates)}</b>
            <p>{i === rows - 1 && i === alternates + 3 ? "If nobody else is available the Owner stays accountable and the lead stays in the recovery queue." : "If nobody acknowledges in time, the lead moves to the next level."}</p>
            <div className="step-chips">
              <label className="sr-only" htmlFor={`win-${i}`}>Seconds for level {i + 1}</label>
              <input
                id={`win-${i}`}
                type="number"
                min={1}
                max={86400}
                value={windowAt(i)}
                disabled={!canEdit}
                onChange={(e) => setWindows(Array.from({ length: rows }, (_, k) => (k === i ? Number(e.target.value) : windowAt(k))))}
                className="cal-input"
                style={{ width: 100, margin: 0, height: 32 }}
              />
              <span className="chip slate">seconds</span>
            </div>
          </div>
        ))}
      </div>

      <div className="rule-line" />
      <div className="switch-row">
        <div>
          <label htmlFor="absence" style={{ fontSize: 12, fontWeight: 700, color: "#29444b" }}>Reassign unacknowledged leads on absence</label>
          <div className="helptext">Setting someone to On leave or Offline moves their unacknowledged leads immediately. Leads they already acknowledged stay with them until a manager reassigns them.</div>
        </div>
        <input id="absence" type="checkbox" checked={onAbsence} disabled={!canEdit} onChange={(e) => setOnAbsence(e.target.checked)} style={{ width: 20, height: 20 }} />
      </div>

      {message && <p role={message.ok ? "status" : "alert"} className="notice-main" style={{ marginTop: 16, color: message.ok ? "var(--teal-dark)" : "var(--coral)" }}>{message.text}</p>}
      {canEdit ? (
        <div style={{ marginTop: 18 }}><button type="submit" className="btn primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button></div>
      ) : (
        <p className="helptext" style={{ marginTop: 16 }}>You can view these rules but only people with the assignment permission can change them.</p>
      )}
    </form>
  );
}

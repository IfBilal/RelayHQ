"use client";

import { useSyncExternalStore } from "react";

function span(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m${s % 60 ? ` ${s % 60}s` : ""}`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

/**
 * Projects a persisted deadline. It never decides anything: expiry and escalation happen in the
 * database; when the deadline passes this only changes its wording until the next refresh.
 */
const subscribe = (notify: () => void) => {
  const id = setInterval(notify, 1000); // display refresh only
  return () => clearInterval(id);
};
const snapshot = () => Math.floor(Date.now() / 1000) * 1000;

export function Countdown({ deadlineAt, tone = "sla" }: { deadlineAt: string | null; tone?: "sla" | "plain" }) {
  const now = useSyncExternalStore(subscribe, snapshot, () => null);

  if (!deadlineAt) return <span className={tone === "sla" ? "sla" : undefined}>Acknowledged</span>;
  const due = new Date(deadlineAt).getTime();
  if (now === null) return <span className={tone === "sla" ? "sla warn" : undefined}>…</span>;
  const diff = due - now;
  const label = diff > 0 ? `${span(diff)} remaining` : `Overdue by ${span(-diff)}`;
  const cls = tone === "sla" ? `sla${diff > 0 ? " warn" : ""}` : undefined;
  return (
    <span className={cls} title={`Due ${new Date(deadlineAt).toLocaleString()}`}>
      {label}
    </span>
  );
}

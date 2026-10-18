"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Option {
  id: string;
  name: string;
}

export function OpportunityForm({ contacts, pipelineId, stages, canSetValue, defaultContactId }: {
  contacts: Option[];
  pipelineId: string;
  stages: Option[];
  canSetValue: boolean;
  defaultContactId?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch("/api/v1/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: f.contactId,
          pipelineId,
          stageId: f.stageId,
          title: f.title,
          ...(canSetValue && f.value ? { value: Number(f.value) } : {}),
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = (json?.error?.details?.fields ?? []) as { label?: string }[];
        setMessage(Array.isArray(fields) && fields[0]?.label ? `Fill in ${fields.map((x) => x.label).join(", ")} first.` : (json?.error?.message ?? "Something went wrong."));
        return;
      }
      router.push(`/pipelines/${pipelineId}`);
      router.refresh();
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const select = (name: string, label: string, options: Option[], defaultValue?: string) => (
    <div>
      <label htmlFor={name} className="formlabel">
        {label}
      </label>
      <select id={name} name={name} required defaultValue={defaultValue} className="cal-input" style={{ width: "100%", margin: 0 }}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>
            {o.name}
          </option>
        ))}
      </select>
    </div>
  );

  return (
    <form onSubmit={onSubmit} className="card rule-form" style={{ maxWidth: 640, display: "grid", gap: 18 }}>
      <div>
        <label htmlFor="title" className="formlabel">
          Opportunity title
        </label>
        <input id="title" name="title" required className="cal-input" style={{ width: "100%", margin: 0 }} />
      </div>
      {select("contactId", "Contact", contacts, defaultContactId)}
      {select("stageId", "Stage", stages)}
      {canSetValue && (
        <div>
          <label htmlFor="value" className="formlabel">
            Value (USD)
          </label>
          <input id="value" name="value" type="number" min="0" step="0.01" className="cal-input" style={{ width: "100%", margin: 0 }} />
        </div>
      )}
      {message && (
        <p role="alert" className="notice-main" style={{ color: "var(--coral)" }}>
          {message}
        </p>
      )}
      <div>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Create opportunity"}
        </button>
      </div>
    </form>
  );
}

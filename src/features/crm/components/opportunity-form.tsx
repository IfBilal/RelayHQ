"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

interface Option {
  id: string;
  name: string;
}

export interface CustomField {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "checkbox";
  options: string[];
}

export function OpportunityForm({ contacts, pipelineId, stages, canSetValue, defaultContactId, fields = [], stageRequired = {} }: {
  contacts: Option[];
  pipelineId: string;
  stages: Option[];
  canSetValue: boolean;
  defaultContactId?: string;
  fields?: CustomField[];
  /** stage id -> ids of fields that must be filled to enter that stage */
  stageRequired?: Record<string, string[]>;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [stageId, setStageId] = useState(stages[0]?.id ?? "");
  const required = new Set(stageRequired[stageId] ?? []);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const fd = new FormData(e.currentTarget);
    const f = Object.fromEntries(fd) as Record<string, string>;
    const customValues: Record<string, string | number | boolean> = {};
    for (const c of fields) {
      const raw = c.type === "checkbox" ? (fd.get(`cf_${c.key}`) ? true : "") : String(fd.get(`cf_${c.key}`) ?? "").trim();
      if (raw === "") continue;
      customValues[c.key] = c.type === "number" ? Number(raw) : (raw as string | boolean);
    }
    try {
      const res = await fetch("/api/v1/opportunities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contactId: f.contactId,
          pipelineId,
          stageId: f.stageId,
          title: f.title,
          customValues,
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
      <div>
        <label htmlFor="stageId" className="formlabel">Stage</label>
        <select id="stageId" name="stageId" required value={stageId} onChange={(e) => setStageId(e.target.value)} className="cal-input" style={{ width: "100%", margin: 0 }}>
          {stages.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
        </select>
      </div>
      {fields.map((c) => {
        const id = `cf_${c.key}`;
        const req = required.has(c.id);
        const label = `${c.label}${req ? " (required for this stage)" : ""}`;
        return (
          <div key={c.id}>
            {c.type === "checkbox" ? (
              <label htmlFor={id} className="formlabel" style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <input id={id} name={id} type="checkbox" required={req} /> {label}
              </label>
            ) : (
              <>
                <label htmlFor={id} className="formlabel">{label}</label>
                {c.type === "dropdown" ? (
                  <select id={id} name={id} required={req} defaultValue="" className="cal-input" style={{ width: "100%", margin: 0 }}>
                    <option value="">{req ? "Select…" : "—"}</option>
                    {c.options.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input id={id} name={id} required={req} type={c.type === "number" ? "number" : c.type === "date" ? "date" : "text"} step={c.type === "number" ? "any" : undefined} className="cal-input" style={{ width: "100%", margin: 0 }} />
                )}
              </>
            )}
          </div>
        );
      })}
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

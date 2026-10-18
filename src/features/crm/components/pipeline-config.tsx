"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ConfigStage, FieldDef } from "../server/config";

type ApiJson = { error?: { message?: string; details?: Record<string, unknown> } };
type Msg = { ok: boolean; text: string } | null;

async function call(method: string, url: string, body?: unknown): Promise<{ ok: boolean; json: ApiJson }> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
    return { ok: res.ok, json: (await res.json().catch(() => ({}))) as ApiJson };
  } catch {
    return { ok: false, json: { error: { message: "We couldn't reach the server." } } };
  }
}

const field = { width: "100%", margin: 0 } as const;

export function PipelineConfig({ pipeline, stages, fields, canManage }: {
  pipeline: { id: string; name: string } | null;
  stages: ConfigStage[];
  fields: FieldDef[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>(null);
  const [busy, setBusy] = useState(false);
  const [moveTo, setMoveTo] = useState<Record<string, string>>({});

  async function run(method: string, url: string, body: unknown, ok: string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const res = await call(method, url, body);
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: true, text: ok });
      after?.();
      router.refresh();
    } else {
      const d = res.json.error?.details;
      const extra = d?.blocked ? ` (${String(d.blocked)} opportunities lack fields the destination requires)` : d?.opportunities ? ` (${String(d.opportunities)} opportunities are in it: pick a destination stage)` : "";
      setMsg({ ok: false, text: (res.json.error?.message ?? "Couldn't save that change.") + extra });
    }
  }

  const form = (onSubmit: (f: HTMLFormElement) => void) => (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit(e.currentTarget);
  };

  function move(index: number, dir: -1 | 1) {
    const order = stages.map((s) => s.id);
    const j = index + dir;
    if (j < 0 || j >= order.length) return;
    [order[index], order[j]] = [order[j], order[index]];
    run("PUT", `/api/v1/pipelines/${pipeline!.id}/stages`, { order }, "Stage order saved.");
  }

  function toggleRequired(stage: ConfigStage, fieldId: string) {
    const set = new Set(stage.required);
    if (set.has(fieldId)) set.delete(fieldId);
    else set.add(fieldId);
    run("PUT", `/api/v1/stages/${stage.id}/required-fields`, { fields: [...set] }, `Required fields for "${stage.name}" saved.`);
  }

  return (
    <div style={{ display: "grid", gap: 18 }}>
      <div role="status" aria-live="polite">
        {msg && <p role={msg.ok ? "status" : "alert"} className="card panel" style={{ color: msg.ok ? "var(--green, #2f7d5b)" : "var(--coral)" }}>{msg.text}</p>}
      </div>

      {canManage && (
        <form className="card panel" onSubmit={form((f) => run("POST", "/api/v1/pipelines", { name: new FormData(f).get("name") }, "Pipeline created.", () => f.reset()))} aria-label="New pipeline">
          <h2>New pipeline</h2>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <label className="sr-only" htmlFor="np-name">Pipeline name</label>
            <input id="np-name" name="name" required maxLength={80} placeholder="e.g. Commercial installs" className="cal-input" style={{ margin: 0, flex: 1 }} />
            <button className="btn primary" disabled={busy}>Create pipeline</button>
          </div>
        </form>
      )}

      {!pipeline ? (
        <div className="card panel"><h2>No pipelines yet</h2></div>
      ) : (
        <>
          <section className="card panel" aria-labelledby="stages-h">
            <h2 id="stages-h">Stages in {pipeline.name}</h2>
            <p className="subline" style={{ marginTop: 6 }}>Order them, rename them, and choose which fields must be filled before an opportunity can enter a stage.</p>
            <div className="ghost-divider" />
            {stages.map((s, i) => {
              const others = stages.filter((o) => o.id !== s.id);
              return (
                <div key={s.id} style={{ marginBottom: 20 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {canManage ? (
                      <form onSubmit={form((f) => run("PATCH", `/api/v1/stages/${s.id}`, { name: new FormData(f).get("name") }, "Stage renamed."))} style={{ display: "flex", gap: 6 }}>
                        <label className="sr-only" htmlFor={`sn-${s.id}`}>Name of stage {i + 1}</label>
                        <input id={`sn-${s.id}`} name="name" required maxLength={80} defaultValue={s.name} className="cal-input" style={{ margin: 0, height: 34 }} />
                        <button className="btn" disabled={busy}>Rename</button>
                      </form>
                    ) : (
                      <b>{s.name}</b>
                    )}
                    <span className="member-secondary">{s.count} open{s.terminal_type ? ` · ${s.terminal_type}` : ""}</span>
                    {canManage && (
                      <>
                        <button type="button" className="btn" disabled={busy || i === 0} onClick={() => move(i, -1)} aria-label={`Move ${s.name} up`}>↑</button>
                        <button type="button" className="btn" disabled={busy || i === stages.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${s.name} down`}>↓</button>
                        <label className="sr-only" htmlFor={`mv-${s.id}`}>Move opportunities of {s.name} to</label>
                        <select id={`mv-${s.id}`} className="cal-input" style={{ margin: 0, height: 34 }} value={moveTo[s.id] ?? ""} onChange={(e) => setMoveTo({ ...moveTo, [s.id]: e.target.value })}>
                          <option value="">{s.count ? "Move to…" : "No move needed"}</option>
                          {others.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
                        </select>
                        <button type="button" className="btn" disabled={busy || stages.length <= 1 || (s.count > 0 && !moveTo[s.id])}
                          onClick={() => run("DELETE", `/api/v1/stages/${s.id}${moveTo[s.id] ? `?moveTo=${moveTo[s.id]}` : ""}`, undefined, "Stage deleted.")}>Delete</button>
                      </>
                    )}
                  </div>
                  <fieldset style={{ border: 0, padding: 0, margin: "8px 0 0" }} disabled={!canManage || busy}>
                    <legend className="member-secondary">Required to enter this stage</legend>
                    {fields.length === 0 ? <span className="member-secondary">No custom fields yet.</span> : fields.map((f) => (
                      <label key={f.id} style={{ display: "inline-flex", gap: 4, alignItems: "center", marginRight: 14, fontSize: 12 }}>
                        <input type="checkbox" checked={s.required.includes(f.id)} onChange={() => toggleRequired(s, f.id)} /> {f.label}
                      </label>
                    ))}
                  </fieldset>
                </div>
              );
            })}
            {canManage && (
              <form onSubmit={form((f) => run("POST", `/api/v1/pipelines/${pipeline.id}/stages`, { name: new FormData(f).get("name") }, "Stage added.", () => f.reset()))} style={{ display: "flex", gap: 8 }} aria-label="Add stage">
                <label className="sr-only" htmlFor="as-name">New stage name</label>
                <input id="as-name" name="name" required maxLength={80} placeholder="New stage name" className="cal-input" style={{ margin: 0, flex: 1 }} />
                <button className="btn primary" disabled={busy}>Add stage</button>
              </form>
            )}
          </section>

          <section className="card panel" aria-labelledby="fields-h">
            <h2 id="fields-h">Custom fields</h2>
            <p className="subline" style={{ marginTop: 6 }}>Shown on the opportunity form. A field can belong to this pipeline only or to every pipeline.</p>
            <div className="ghost-divider" />
            {fields.length === 0 ? <p className="subline">No custom fields yet.</p> : (
              <ul style={{ listStyle: "none", padding: 0, margin: "0 0 14px" }}>
                {fields.map((f) => (
                  <li key={f.id} className="member" style={{ marginBottom: 10 }}>
                    <div className="member-main">
                      <div className="member-name">{f.label} <span className="event-id">{f.key}</span></div>
                      <div className="member-secondary">{f.type}{f.type === "dropdown" ? `: ${f.options.join(", ")}` : ""} · {f.pipeline_id ? "this pipeline" : "all pipelines"}</div>
                    </div>
                    {canManage && <button type="button" className="btn" disabled={busy} onClick={() => run("DELETE", `/api/v1/fields/${f.id}`, undefined, "Field archived.")}>Archive</button>}
                  </li>
                ))}
              </ul>
            )}
            {canManage && <NewField pipelineId={pipeline.id} busy={busy} run={run} />}
          </section>
        </>
      )}
    </div>
  );
}

function NewField({ pipelineId, busy, run }: { pipelineId: string; busy: boolean; run: (m: string, u: string, b: unknown, ok: string, after?: () => void) => void }) {
  const [type, setType] = useState("text");
  return (
    <form
      aria-label="Add custom field"
      onSubmit={(e) => {
        e.preventDefault();
        const f = e.currentTarget;
        const d = new FormData(f);
        run("POST", "/api/v1/fields", {
          pipelineId: d.get("scope") === "all" ? null : pipelineId,
          key: d.get("key"),
          label: d.get("label"),
          type,
          options: String(d.get("options") ?? "").split(",").map((o) => o.trim()).filter(Boolean),
        }, "Field added.", () => f.reset());
      }}
      style={{ display: "grid", gap: 12 }}
    >
      <div className="formrow">
        <div><label className="formlabel" htmlFor="nf-label">Label</label><input id="nf-label" name="label" required maxLength={80} className="cal-input" style={field} /></div>
        <div><label className="formlabel" htmlFor="nf-key">Key (lowercase, underscores)</label><input id="nf-key" name="key" required pattern="[a-z][a-z0-9_]{0,39}" className="cal-input" style={field} /></div>
      </div>
      <div className="formrow">
        <div>
          <label className="formlabel" htmlFor="nf-type">Type</label>
          <select id="nf-type" value={type} onChange={(e) => setType(e.target.value)} className="cal-input" style={field}>
            <option value="text">Text</option><option value="number">Number</option><option value="date">Date</option><option value="dropdown">Dropdown</option><option value="checkbox">Checkbox</option>
          </select>
        </div>
        <div>
          <label className="formlabel" htmlFor="nf-scope">Applies to</label>
          <select id="nf-scope" name="scope" className="cal-input" style={field}><option value="pipeline">This pipeline</option><option value="all">All pipelines</option></select>
        </div>
      </div>
      {type === "dropdown" && (
        <div><label className="formlabel" htmlFor="nf-options">Options (comma separated)</label><input id="nf-options" name="options" required className="cal-input" style={field} /></div>
      )}
      <div><button className="btn primary" disabled={busy}>Add field</button></div>
    </form>
  );
}

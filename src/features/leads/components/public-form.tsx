"use client";

import { useState } from "react";

export function PublicLeadForm({ slug, workspaceName }: { slug: string; workspaceName: string }) {
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dedupeKey] = useState(() => crypto.randomUUID());

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setState("busy");
    setMessage(null);
    setErrors({});
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch(`/api/v1/public/forms/${slug}/leads`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, summary: f.summary, website: f.website, dedupeKey }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = json?.error?.details?.fields as Record<string, string[]> | undefined;
        if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
        setMessage(json?.error?.message ?? "Something went wrong. Please try again.");
        setState("idle");
        return;
      }
      setState("done");
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
      setState("idle");
    }
  }

  if (state === "done") {
    return (
      <div role="status" className="card panel">
        <h2>Thanks, we&apos;ve got your request</h2>
        <p className="subline" style={{ marginTop: 8 }}>A member of the {workspaceName} team will be in touch shortly.</p>
      </div>
    );
  }

  const field = (name: string, label: string, props: React.ComponentProps<"input"> = {}) => (
    <div>
      <label htmlFor={name} className="formlabel">{label}</label>
      <input id={name} name={name} className="cal-input" style={{ width: "100%", margin: 0 }} aria-invalid={!!errors[name]} {...props} />
      {errors[name] && <p role="alert" className="helptext" style={{ color: "var(--coral)" }}>{errors[name]}</p>}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="card rule-form" style={{ display: "grid", gap: 16 }}>
      {field("name", "Your name", { required: true, autoComplete: "name" })}
      {field("email", "Email", { type: "email", autoComplete: "email" })}
      {field("phone", "Phone", { type: "tel", autoComplete: "tel", placeholder: "+14155550184" })}
      {field("summary", "How can we help?", { maxLength: 500 })}
      {/* Honeypot: hidden from people and assistive tech; bots tend to fill every input. */}
      <div aria-hidden="true" style={{ position: "absolute", left: -9999, height: 0, overflow: "hidden" }}>
        <label htmlFor="website">Website</label>
        <input id="website" name="website" tabIndex={-1} autoComplete="off" />
      </div>
      <p className="helptext">Give us an email or a phone number so we can reach you.</p>
      {message && <p role="alert" className="notice-main" style={{ color: "var(--coral)" }}>{message}</p>}
      <div>
        <button type="submit" className="btn primary" disabled={state === "busy"}>{state === "busy" ? "Sending…" : "Send request"}</button>
      </div>
    </form>
  );
}

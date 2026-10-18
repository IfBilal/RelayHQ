"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ContactForm() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setErrors({});
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    try {
      const res = await fetch("/api/v1/contacts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: f.name, email: f.email, phone: f.phone, companyName: f.companyName }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = json?.error?.details?.fields as Record<string, string[]> | undefined;
        if (fields) setErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
        setMessage(json?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      router.push(`/contacts/${json.id}`);
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const field = (name: string, label: string, props: React.ComponentProps<"input"> = {}) => (
    <div>
      <label htmlFor={name} className="formlabel">
        {label}
      </label>
      <input id={name} name={name} className="cal-input" style={{ width: "100%", margin: 0 }} aria-invalid={!!errors[name]} {...props} />
      {errors[name] && (
        <p role="alert" className="helptext" style={{ color: "var(--coral)" }}>
          {errors[name]}
        </p>
      )}
    </div>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="card rule-form" style={{ maxWidth: 640, display: "grid", gap: 18 }}>
      {field("name", "Full name", { required: true, autoComplete: "off" })}
      <div className="formrow" style={{ marginBottom: 0 }}>
        {field("email", "Email", { type: "email" })}
        {field("phone", "Phone", { type: "tel", placeholder: "+14155550184" })}
      </div>
      {field("companyName", "Company")}
      {message && (
        <p role="alert" className="notice-main" style={{ color: "var(--coral)" }}>
          {message}
        </p>
      )}
      <div>
        <button type="submit" className="btn primary" disabled={busy}>
          {busy ? "Saving…" : "Create contact"}
        </button>
      </div>
    </form>
  );
}

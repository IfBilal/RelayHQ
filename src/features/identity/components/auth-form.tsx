"use client";

import { safeNext } from "@/lib/safe-next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { slugify } from "@/features/identity/schemas";

type Mode = "login" | "signup" | "onboarding";

const COPY: Record<Mode, { title: string; submit: string; endpoint: string }> = {
  login: { title: "Sign in to RelayHQ", submit: "Sign in", endpoint: "/api/v1/auth/login" },
  signup: { title: "Create your workspace", submit: "Create workspace", endpoint: "/api/v1/auth/signup" },
  onboarding: { title: "Name your workspace", submit: "Create workspace", endpoint: "/api/v1/workspaces" },
};

const SUB: Record<Mode, string> = {
  login: "Welcome back. Every lead, owned. Every follow-up, visible.",
  signup: "Set up your company in under a minute. No card required.",
  onboarding: "Your account exists; give your workspace a name to continue.",
};

function Field({ label, name, type = "text", hint, error, ...rest }: React.ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input id={name} name={name} type={type} aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined} {...rest} />
      {hint && !error && <p className="auth-hint">{hint}</p>}
      {error && (
        <p id={`${name}-err`} className="auth-err">
          {error}
        </p>
      )}
    </div>
  );
}

export function AuthForm({ mode, next }: { mode: Mode; next?: string }) {
  const router = useRouter();
  const copy = COPY[mode];
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    setFieldErrors({});
    const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
    const body =
      mode === "login"
        ? { email: f.email, password: f.password }
        : mode === "signup"
          ? { name: f.name, email: f.email, password: f.password, workspaceName: f.workspaceName, workspaceSlug: slug }
          : { name: f.workspaceName, slug };
    try {
      const res = await fetch(copy.endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const fields = json?.error?.details?.fields as Record<string, string[]> | undefined;
        if (fields) setFieldErrors(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, v[0]])));
        setMessage(json?.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      if (res.status === 202) {
        setMessage("Check your email to confirm your address, then sign in to finish creating your workspace.");
        return;
      }
      router.replace(safeNext(next, window.location.origin));
      router.refresh();
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const needsWorkspace = mode !== "login";
  return (
    <div className="auth-scene">
      <svg className="auth-waves" viewBox="0 0 1440 900" preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="auth-wave-grad" x1="0" x2="1">
            <stop offset="0" stopColor="#3b82f6" stopOpacity="0" />
            <stop offset=".5" stopColor="#60a5fa" stopOpacity=".9" />
            <stop offset="1" stopColor="#3b82f6" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path strokeDasharray="6 10" d="M-100,520 C200,420 400,640 700,540 S1200,420 1540,560" />
        <path strokeDasharray="4 14" d="M-100,600 C250,520 450,720 760,620 S1250,500 1540,640" />
        <path strokeDasharray="2 18" d="M-100,440 C220,360 420,560 720,460 S1230,340 1540,480" />
      </svg>
      <aside className="auth-side" aria-hidden="true">
        <div className="auth-brand"><span className="auth-brand-mark">R</span> relayhq</div>
        <div className="auth-hero">
          <h2>The operating system for <span>lead accountability.</span></h2>
          <p>One owner per lead, automatic escalation when nobody responds, and every action audited. Payments, calendars and alerts run on real provider sandboxes.</p>
          <div className="auth-stats">
            <div><b>1</b><small>owner per lead</small></div>
            <div><b>&lt; 60s</b><small>escalation alert</small></div>
            <div><b>100%</b><small>actions audited</small></div>
          </div>
        </div>
        <div className="auth-foot"><span>© 2026 RelayHQ</span><span>Supabase · Stripe · Google Calendar</span></div>
      </aside>
      <main className="auth-panel">
      <div className="auth-card">
      <div className="auth-pill"><i /> Secure sign-in · Supabase Auth</div>
      <h1>{copy.title}</h1>
      <p className="auth-sub">{SUB[mode]}</p>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {mode === "signup" && <Field label="Your name" name="name" autoComplete="name" required error={fieldErrors.name} />}
        {mode !== "onboarding" && <Field label="Work email" name="email" type="email" autoComplete="email" required error={fieldErrors.email} />}
        {mode !== "onboarding" && (
          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            hint={mode === "signup" ? "At least 8 characters." : undefined}
            required
            error={fieldErrors.password}
          />
        )}
        {needsWorkspace && (
          <>
            <Field
              label="Company name"
              name="workspaceName"
              required
              onChange={(e) => !slugTouched && setSlug(slugify(e.target.value))}
              error={fieldErrors.workspaceName}
            />
            <Field
              label="Workspace address"
              name="workspaceSlug"
              value={slug}
              onChange={(e) => {
                setSlugTouched(true);
                setSlug(slugify(e.target.value));
              }}
              hint="Used in your public lead form link."
              required
              error={fieldErrors.workspaceSlug}
            />
          </>
        )}
        {message && (
          <p role="alert" className="auth-alert">{message}</p>
        )}
        <button type="submit" disabled={busy} className="auth-btn">
          {busy ? "Please wait…" : copy.submit}
        </button>
      </form>
      {mode !== "onboarding" && (
        <p className="auth-switch">
          {mode === "login" ? "New company? " : "Already have an account? "}
          <Link href={mode === "login" ? "/signup" : "/login"}>
            {mode === "login" ? "Create a workspace" : "Sign in"}
          </Link>
        </p>
      )}
      </div>
      </main>
    </div>
  );
}

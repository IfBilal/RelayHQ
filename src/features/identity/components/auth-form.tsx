"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { slugify } from "@/features/identity/schemas";

type Mode = "login" | "signup" | "onboarding";

const COPY: Record<Mode, { title: string; submit: string; endpoint: string }> = {
  login: { title: "Sign in to RelayHQ", submit: "Sign in", endpoint: "/api/v1/auth/login" },
  signup: { title: "Create your workspace", submit: "Create workspace", endpoint: "/api/v1/auth/signup" },
  onboarding: { title: "Name your workspace", submit: "Create workspace", endpoint: "/api/v1/workspaces" },
};

const inputClass =
  "h-11 w-full rounded-[10px] border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Field({ label, name, type = "text", hint, error, ...rest }: React.ComponentProps<"input"> & { label: string; hint?: string; error?: string }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input id={name} name={name} type={type} className={inputClass} aria-invalid={!!error} aria-describedby={error ? `${name}-err` : undefined} {...rest} />
      {hint && !error && <p className="text-xs text-muted-foreground">{hint}</p>}
      {error && (
        <p id={`${name}-err`} className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/** Only same-site relative paths: never an open redirect. */
function safeNext(next?: string) {
  if (!next) return "/dashboard";
  try {
    const url = new URL(next, window.location.origin);
    return url.origin === window.location.origin ? url.pathname + url.search + url.hash : "/dashboard";
  } catch {
    return "/dashboard";
  }
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
      router.replace(safeNext(next));
      router.refresh();
    } catch {
      setMessage("We couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  const needsWorkspace = mode !== "login";
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 px-4 py-10">
      <h1 className="text-[25px] font-semibold tracking-tight sm:text-[30px]">{copy.title}</h1>
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
          <p role="alert" className="rounded-[10px] bg-[var(--coral-bg,#FCEDEA)] px-3 py-2 text-sm text-[var(--coral,#BB5049)]">
            {message}
          </p>
        )}
        <Button type="submit" disabled={busy} className="h-11 w-full">
          {busy ? "Please wait…" : copy.submit}
        </Button>
      </form>
      {mode !== "onboarding" && (
        <p className="text-sm text-muted-foreground">
          {mode === "login" ? "New company? " : "Already have an account? "}
          <Link href={mode === "login" ? "/signup" : "/login"} className="font-medium text-foreground underline">
            {mode === "login" ? "Create a workspace" : "Sign in"}
          </Link>
        </p>
      )}
    </main>
  );
}

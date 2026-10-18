import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/features/identity/server/session";
import { SignOutButton } from "@/features/identity/components/sign-out-button";

async function Shell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const ctx = await getSessionContext();
  if (!ctx) redirect("/onboarding");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between border-b px-4 py-3 sm:px-8">
        <span className="font-semibold">{ctx.workspace.name}</span>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden text-muted-foreground sm:inline">
            {ctx.user.displayName} · {ctx.baseRole}
          </span>
          <SignOutButton />
        </div>
      </header>
      <div className="flex-1 px-4 py-6 sm:px-8">{children}</div>
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

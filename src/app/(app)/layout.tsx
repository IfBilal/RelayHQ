import "@/styles/relay.css";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSessionContext } from "@/features/identity/server/session";
import { SignOutButton } from "@/features/identity/components/sign-out-button";
import { AppShell } from "@/components/relay/app-shell";

const ROLE_LABEL = { owner: "Workspace owner", admin: "Admin", user: "Team member" } as const;

async function Shell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  const ctx = await getSessionContext();
  if (!ctx) redirect("/onboarding");

  return (
    <AppShell
      workspaceName={ctx.workspace.name}
      userName={ctx.user.displayName}
      roleLabel={ROLE_LABEL[ctx.baseRole]}
      signOut={<SignOutButton />}
    >
      {children}
    </AppShell>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}

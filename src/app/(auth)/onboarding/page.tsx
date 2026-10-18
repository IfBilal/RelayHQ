import { Suspense } from "react";
import { redirect } from "next/navigation";
import { AuthForm } from "@/features/identity/components/auth-form";
import { getSessionContext } from "@/features/identity/server/session";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Set up workspace · RelayHQ" };

async function Gate() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/login");
  if (await getSessionContext()) redirect("/dashboard");
  return <AuthForm mode="onboarding" />;
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Gate />
    </Suspense>
  );
}

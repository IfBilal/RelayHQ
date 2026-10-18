import { Suspense } from "react";
import { AuthForm } from "@/features/identity/components/auth-form";

export const metadata = { title: "Create workspace · RelayHQ" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <AuthForm mode="signup" next={next} />;
}

export default function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <Suspense fallback={<div className="min-h-dvh" aria-busy="true" />}>
      <Form searchParams={searchParams} />
    </Suspense>
  );
}

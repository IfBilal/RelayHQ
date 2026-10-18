import { Suspense } from "react";
import { notFound } from "next/navigation";
import { createClient } from "@supabase/supabase-js";
import { PublicLeadForm } from "@/features/leads/components/public-form";

export const metadata = { title: "Contact us", robots: { index: false } };

async function Form({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/.test(slug)) notFound();
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: name } = await supabase.rpc("public_form_info", { p_slug: slug });
  if (!name) notFound();
  return (
    <>
      <h1 style={{ fontSize: 28 }}>Talk to {name}</h1>
      <p className="subline" style={{ margin: "8px 0 22px" }}>Tell us what you need and we&apos;ll get back to you.</p>
      <PublicLeadForm slug={slug} workspaceName={name} />
    </>
  );
}

export default function PublicFormPage({ params }: { params: Promise<{ slug: string }> }) {
  return (
    <Suspense fallback={<div aria-busy="true" />}>
      <Form params={params} />
    </Suspense>
  );
}

import "@/styles/relay.css";
import { Suspense } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AcceptInvite } from "@/features/team/components/accept-invite";

export const metadata = { title: "Join a workspace · RelayHQ" };

async function Body({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const next = `/invite?token=${encodeURIComponent(token ?? "")}`;

  if (!token) return <p role="alert">This invitation link is incomplete. Ask your administrator for a new one.</p>;
  if (data.user) return <AcceptInvite token={token} email={data.user.email ?? ""} />;
  return (
    <>
      <p className="subline">Sign in or create an account with the email address that was invited, then return to this page.</p>
      <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
        <Link className="btn primary" href={`/login?next=${encodeURIComponent(next)}`}>Sign in</Link>
        <Link className="btn" href={`/signup?next=${encodeURIComponent(next)}`}>Create account</Link>
      </div>
    </>
  );
}

export default function InvitePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  return (
    <main style={{ maxWidth: 460, margin: "10vh auto", padding: "0 16px" }}>
      <div className="card panel">
        <h1 style={{ fontSize: 20, marginBottom: 10 }}>Join a workspace</h1>
        <Suspense fallback={<p aria-busy="true">Loading…</p>}>
          <Body searchParams={searchParams} />
        </Suspense>
      </div>
    </main>
  );
}

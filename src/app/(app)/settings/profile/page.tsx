import { PageHeader } from "@/components/relay/kit";
import { getSessionContext } from "@/features/identity/server/session";
import { ProfileForm } from "@/features/team/components/profile-form";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Profile · RelayHQ" };

export default async function ProfilePage() {
  const ctx = (await getSessionContext())!;
  const supabase = await createClient();
  const { data: p, error } = await supabase.from("profiles").select("display_name, timezone, notification_email").eq("id", ctx.user.id).maybeSingle();
  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Profile" subtitle="Your name, time zone and where alerts are sent." />
      {error || !p ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load your profile</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : (
        <ProfileForm initial={{ displayName: p.display_name, timezone: p.timezone, notificationEmail: p.notification_email ?? "", accountEmail: ctx.user.email }} />
      )}
    </>
  );
}

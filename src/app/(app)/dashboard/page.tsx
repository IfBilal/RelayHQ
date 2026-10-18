import { getSessionContext } from "@/features/identity/server/session";

export const metadata = { title: "Dashboard · RelayHQ" };

export default async function DashboardPage() {
  const ctx = (await getSessionContext())!;
  return (
    <main className="mx-auto max-w-5xl space-y-2">
      <h1 className="text-[25px] font-semibold tracking-tight sm:text-[30px]">Dashboard</h1>
      <p className="text-muted-foreground">
        Signed in as {ctx.user.email} with {ctx.permissions.length} permissions. Metrics arrive with the lead engine.
      </p>
    </main>
  );
}

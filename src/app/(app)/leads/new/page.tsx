import { redirect } from "next/navigation";
import { LinkButton, PageHeader } from "@/components/relay/kit";
import { LeadForm } from "@/features/leads/components/lead-form";
import { can, getSessionContext } from "@/features/identity/server/session";
import { listContacts } from "@/features/crm/server/contacts";

export const metadata = { title: "New lead · RelayHQ" };

export default async function NewLeadPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "lead.create")) redirect("/leads");
  const contacts = await listContacts(ctx, { limit: 100 });
  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="New lead" subtitle="Capture a lead by hand. It is assigned to exactly one owner straight away." />
      {contacts.error || !contacts.items.length ? (
        <div className="card panel" role="alert">
          <h2>Add a contact first</h2>
          <p className="subline" style={{ margin: "8px 0 14px" }}>A lead belongs to a contact. Create one, then come back.</p>
          <LinkButton href="/contacts/new" style="primary">New contact</LinkButton>
        </div>
      ) : (
        <LeadForm contacts={contacts.items.map((c) => ({ id: c.id, name: c.name }))} />
      )}
    </>
  );
}

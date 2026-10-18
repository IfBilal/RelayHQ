import { redirect } from "next/navigation";
import { PageHeader } from "@/components/relay/kit";
import { ContactForm } from "@/features/crm/components/contact-form";
import { can, getSessionContext } from "@/features/identity/server/session";

export const metadata = { title: "New contact · RelayHQ" };

export default async function NewContactPage() {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "crm.create")) redirect("/contacts");
  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="New contact" subtitle="Phone numbers are stored in international format so messages can match them later." />
      <ContactForm />
    </>
  );
}

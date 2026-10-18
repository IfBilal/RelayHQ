import { PageHeader, PendingButton } from "@/components/relay/kit";
import { InboxView } from "@/components/relay/inbox-view";
import { SampleNote } from "@/components/relay/sample-note";
import { getSessionContext } from "@/features/identity/server/session";

export const metadata = { title: "Conversations · RelayHQ" };

export default async function InboxPage() {
  const ctx = (await getSessionContext())!;
  return (
    <>
      <SampleNote />
      <PageHeader
        workspace={ctx.workspace.name}
        title="Conversations"
        subtitle="Real customer messages with owner, delivery status and a complete history."
        actions={
          <>
            <PendingButton note="Inbox filters arrive with the messaging module.">All inboxes</PendingButton>
            <PendingButton style="primary" note="Compose only to opted-in contacts through verified Twilio; arrives with the messaging module.">New message</PendingButton>
          </>
        }
      />
      <InboxView />
    </>
  );
}

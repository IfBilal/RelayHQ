import { redirect } from "next/navigation";
import { PageHeader } from "@/components/relay/kit";
import { OpportunityForm } from "@/features/crm/components/opportunity-form";
import { can, getSessionContext } from "@/features/identity/server/session";
import { getBoard } from "@/features/crm/server/pipelines";
import { listContacts } from "@/features/crm/server/contacts";
import { loadPipelineConfig } from "@/features/crm/server/config";

export const metadata = { title: "New opportunity · RelayHQ" };

export default async function NewOpportunityPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const ctx = (await getSessionContext())!;
  if (!can(ctx, "crm.create")) redirect("/pipelines/default");
  const sp = await searchParams;
  const board = await getBoard(ctx, sp.pipelineId);
  const contacts = await listContacts(ctx, { limit: 100 });
  if (!board) redirect("/pipelines/default");
  const config = await loadPipelineConfig(ctx, board.pipeline.id);
  const configFailed = "error" in config;
  const fields = "error" in config ? [] : config.fields;
  const stageRequired = "error" in config ? {} : Object.fromEntries(config.stages.map((s) => [s.id, s.required]));

  const open = board.stages.filter((s) => s.terminal_type === null);
  const ordered = sp.stageId ? [...open].sort((a, b) => (a.id === sp.stageId ? -1 : b.id === sp.stageId ? 1 : 0)) : open;

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="New opportunity" subtitle={`Adds a deal to ${board.pipeline.name}.`} />
      {configFailed ? (
        <div className="card panel" role="alert">
          <h2>We couldn&apos;t load this pipeline&apos;s fields</h2>
          <p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p>
        </div>
      ) : contacts.error || !contacts.items.length ? (
        <div className="card panel" role="alert">
          <h2>Add a contact first</h2>
          <p className="subline" style={{ marginTop: 8 }}>Every opportunity belongs to a contact. Create one, then come back.</p>
        </div>
      ) : (
        <OpportunityForm
          contacts={contacts.items.map((c) => ({ id: c.id, name: c.name }))}
          pipelineId={board.pipeline.id}
          stages={ordered.map((s) => ({ id: s.id, name: s.name }))}
          canSetValue={board.canSeeValue}
          defaultContactId={sp.contactId}
          fields={fields}
          stageRequired={stageRequired}
        />
      )}
    </>
  );
}

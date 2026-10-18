import Link from "next/link";
import { PageHeader } from "@/components/relay/kit";
import { can, getSessionContext } from "@/features/identity/server/session";
import { loadPipelineConfig } from "@/features/crm/server/config";
import { PipelineConfig } from "@/features/crm/components/pipeline-config";

export const metadata = { title: "Pipelines and fields · RelayHQ" };

export default async function PipelineSettingsPage({ searchParams }: { searchParams: Promise<{ pipelineId?: string }> }) {
  const { pipelineId } = await searchParams;
  const ctx = (await getSessionContext())!;
  const canManage = can(ctx, "pipeline.manage");
  const config = can(ctx, "crm.view") ? await loadPipelineConfig(ctx, pipelineId) : null;

  return (
    <>
      <PageHeader workspace={ctx.workspace.name} title="Pipelines and fields" subtitle="Shape stages, custom fields and what each stage requires." />
      {!config ? (
        <div className="card panel" role="alert"><h2>You don&apos;t have access</h2><p className="subline" style={{ marginTop: 8 }}>Ask a workspace admin for the CRM view permission.</p></div>
      ) : "error" in config ? (
        <div className="card panel" role="alert"><h2>We couldn&apos;t load the pipeline settings</h2><p className="subline" style={{ marginTop: 8 }}>Please refresh the page to try again.</p></div>
      ) : (
        <>
          {!canManage && <p className="subline" style={{ marginBottom: 12 }}>You can view this configuration; only people with the pipeline-management permission can change it.</p>}
          <nav aria-label="Pipelines" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
            {config.pipelines.map((p) => (
              <Link key={p.id} href={`/settings/pipelines?pipelineId=${p.id}`} className={`btn${p.id === config.pipeline?.id ? " primary" : ""}`} aria-current={p.id === config.pipeline?.id ? "page" : undefined}>{p.name}</Link>
            ))}
          </nav>
          <PipelineConfig key={config.pipeline?.id ?? "none"} pipeline={config.pipeline} stages={config.stages} fields={config.fields} canManage={canManage} />
        </>
      )}
    </>
  );
}

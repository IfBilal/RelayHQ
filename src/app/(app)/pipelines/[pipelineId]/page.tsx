import Link from "next/link";
import { Chip, LinkButton, Metric, PageHeader } from "@/components/relay/kit";
import { Icon } from "@/components/relay/icons";
import { can, getSessionContext } from "@/features/identity/server/session";
import { getBoard } from "@/features/crm/server/pipelines";
import { StageSelect } from "@/features/crm/components/stage-select";
import { formatCompactMoney, formatMoney } from "@/features/crm/format";

export const metadata = { title: "Sales pipeline · RelayHQ" };

const DOT = ["blue", "teal", "gold", "blue", "teal", "gold"];

export default async function PipelinePage({ params }: { params: Promise<{ pipelineId: string }> }) {
  const { pipelineId } = await params;
  const ctx = (await getSessionContext())!;
  const board = can(ctx, "crm.view") ? await getBoard(ctx, pipelineId === "default" ? undefined : pipelineId) : null;

  if (!board) {
    return (
      <>
        <PageHeader workspace={ctx.workspace.name} title="Sales pipeline" subtitle="A clear view of every opportunity, from first contact to close." />
        <div className="card panel" role="alert">
          <h2>{can(ctx, "crm.view") ? "No pipeline yet" : "You don't have access to the pipeline"}</h2>
          <p className="subline" style={{ marginTop: 8 }}>
            {can(ctx, "crm.view") ? "A workspace admin can create one in settings." : "Ask a workspace admin to grant you the CRM view permission."}
          </p>
        </div>
      </>
    );
  }

  const { stages, opportunities, pipeline, pipelines } = board;
  const open = opportunities.filter((o) => stages.find((s) => s.id === o.stage_id)?.terminal_type == null);
  const won = opportunities.filter((o) => stages.find((s) => s.id === o.stage_id)?.terminal_type === "won").length;
  const lost = opportunities.filter((o) => stages.find((s) => s.id === o.stage_id)?.terminal_type === "lost").length;
  const closeRate = won + lost > 0 ? `${Math.round((won / (won + lost)) * 100)}%` : "—";

  return (
    <>
      <PageHeader
        workspace={ctx.workspace.name}
        title="Sales pipeline"
        subtitle="A clear view of every opportunity, from first contact to close."
        actions={
          can(ctx, "crm.create") && (
            <LinkButton href={`/opportunities/new?pipelineId=${pipeline.id}`} style="primary">
              <Icon name="plus" /> New opportunity
            </LinkButton>
          )
        }
      />

      <div className="grid4">
        {board.canSeeValue ? (
          <Metric title="Open pipeline" value={formatCompactMoney(board.openValueMinor ?? 0, "USD")} sub={`${open.length} active ${open.length === 1 ? "opportunity" : "opportunities"}`} icon="trend" />
        ) : (
          <Metric title="Open pipeline" value="Restricted" sub="Values need the opportunity value permission" icon="trend" />
        )}
        <Metric title="Active opportunities" value={String(open.length).padStart(2, "0")} sub="Not yet won or lost" icon="people" />
        <Metric title="Won" value={String(won).padStart(2, "0")} sub="Closed won" icon="check" />
        <Metric title="Close rate" value={closeRate} sub="Won of won + lost" icon="home" />
      </div>

      <div className="controls">
        <div className="inline-actions">
          <div className="filter-tabs" role="group" aria-label="Pipelines">
            {pipelines.map((p) => (
              <Link key={p.id} href={`/pipelines/${p.id}`} className={`filter-tab${p.id === pipeline.id ? " active" : ""}`} aria-current={p.id === pipeline.id ? "page" : undefined}>
                {p.name}
              </Link>
            ))}
          </div>
        </div>
        <span className="statline">Board view · use each card&apos;s stage menu to move it</span>
      </div>

      <div className="board" style={{ gridAutoFlow: "column", gridAutoColumns: "minmax(217px, 1fr)", gridTemplateColumns: "none", overflowX: "auto" }}>
        {stages.map((stage, i) => {
          const cards = opportunities.filter((o) => o.stage_id === stage.id);
          return (
            <section className="board-col" key={stage.id} aria-label={stage.name}>
              <div className="board-header">
                <div className="stage-left">
                  <span className={`stage-dot ${DOT[i % DOT.length]}`} />
                  {stage.name} <Chip tone="slate">{cards.length}</Chip>
                </div>
              </div>
              {cards.length === 0 && <p className="helptext" style={{ textAlign: "center", padding: "10px 0" }}>No opportunities here</p>}
              {cards.map((o) => (
                <div className="deal-card" key={o.id}>
                  <Link href={`/contacts/${o.contact_id}`} className="deal-title">
                    {o.contact?.name || "Unknown contact"}
                  </Link>
                  <div className="deal-sub">{o.title}</div>
                  {o.value_minor !== undefined && <div className="deal-value">{formatMoney(o.value_minor, o.currency)}</div>}
                  {can(ctx, "crm.edit") && <StageSelect opportunityId={o.id} version={o.version} stageId={o.stage_id} stages={stages} label={`Stage for ${o.title}`} />}
                </div>
              ))}
              {can(ctx, "crm.create") && (
                <Link href={`/opportunities/new?pipelineId=${pipeline.id}&stageId=${stage.id}`} className="board-extra" style={{ display: "block" }}>
                  + Add opportunity
                </Link>
              )}
            </section>
          );
        })}
      </div>
      {!board.canSeeValue && <div className="app-footer-note">Opportunity values are hidden because your role doesn&apos;t include the value permission.</div>}
    </>
  );
}

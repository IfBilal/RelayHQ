import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";
import type { OpportunityRow, StageRow } from "../types";

/** Board data for one pipeline. Values are fetched only for viewers with opportunity.value.view. */
export async function getBoard(ctx: SessionContext, pipelineId?: string) {
  const supabase = await createClient();
  const { data: pipelines } = await supabase
    .from("pipelines")
    .select("id, name, is_default")
    .eq("workspace_id", ctx.workspace.id)
    .is("archived_at", null)
    .order("is_default", { ascending: false })
    .order("created_at");
  if (!pipelines?.length) return null;
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  const [{ data: stages }, { data: opps }] = await Promise.all([
    supabase.from("stages").select("id, name, position, terminal_type").eq("pipeline_id", pipeline.id).is("archived_at", null).order("position"),
    supabase
      .from("opportunities")
      .select("id, title, contact_id, stage_id, pipeline_id, currency, version, created_at")
      .eq("workspace_id", ctx.workspace.id)
      .eq("pipeline_id", pipeline.id)
      .is("archived_at", null)
      .order("created_at", { ascending: false })
      .limit(500),
  ]);

  const contactIds = [...new Set((opps ?? []).map((o) => o.contact_id))];
  const names = new Map<string, string>();
  if (contactIds.length) {
    const { data } = await supabase.from("contacts").select("id, name").in("id", contactIds);
    data?.forEach((c) => names.set(c.id, c.name));
  }

  const canSeeValue = ctx.permissions.includes("opportunity.value.view");
  const values = new Map<string, number>();
  const stageTotals = new Map<string, number>();
  if (canSeeValue) {
    if (opps?.length) {
      const { data } = await supabase.rpc("opportunity_values", { p_workspace: ctx.workspace.id, p_ids: opps.map((o) => o.id) });
      (data ?? []).forEach((v: { opportunity_id: string; value_minor: number }) => values.set(v.opportunity_id, Number(v.value_minor)));
    }
    const { data } = await supabase.rpc("pipeline_value_by_stage", { p_workspace: ctx.workspace.id, p_pipeline: pipeline.id });
    (data ?? []).forEach((r: { stage_id: string; open_value_minor: number }) => stageTotals.set(r.stage_id, Number(r.open_value_minor)));
  }

  return {
    pipelines,
    pipeline,
    stages: (stages ?? []) as StageRow[],
    opportunities: (opps ?? []).map((o) => ({
      ...(o as OpportunityRow),
      contact: { name: names.get(o.contact_id) ?? "" },
      ...(values.has(o.id) ? { value_minor: values.get(o.id)! } : {}),
    })) as OpportunityRow[],
    canSeeValue,
    openValueMinor: canSeeValue ? [...stageTotals.values()].reduce((a, b) => a + b, 0) : undefined,
  };
}

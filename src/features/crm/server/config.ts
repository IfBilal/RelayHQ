import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";

export interface FieldDef {
  id: string;
  key: string;
  label: string;
  type: "text" | "number" | "date" | "dropdown" | "checkbox";
  options: string[];
  help_text: string | null;
  pipeline_id: string | null;
}
export interface ConfigStage { id: string; name: string; position: number; terminal_type: "won" | "lost" | null; required: string[]; count: number }

/** Reads through RLS. Fields shown are the ones that apply to the pipeline: its own plus workspace-wide ones. */
export async function loadPipelineConfig(ctx: SessionContext, pipelineId?: string) {
  const supabase = await createClient();
  const ws = ctx.workspace.id;
  const { data: pipelines, error } = await supabase
    .from("pipelines").select("id, name, is_default").eq("workspace_id", ws).is("archived_at", null)
    .order("is_default", { ascending: false }).order("created_at");
  if (error) return { error: true } as const;
  if (!pipelines?.length) return { pipelines: [], pipeline: null, stages: [] as ConfigStage[], fields: [] as FieldDef[] } as const;
  const pipeline = pipelines.find((p) => p.id === pipelineId) ?? pipelines[0];

  const stagesRes = await supabase.from("stages").select("id, name, position, terminal_type").eq("pipeline_id", pipeline.id).is("archived_at", null).order("position");
  if (stagesRes.error) return { error: true } as const;
  const stageIds = (stagesRes.data ?? []).map((s) => s.id);
  const [fields, required, countRes] = await Promise.all([
    supabase.from("field_definitions").select("id, key, label, type, options, help_text, pipeline_id").eq("workspace_id", ws).eq("entity_type", "opportunity").is("archived_at", null).or(`pipeline_id.is.null,pipeline_id.eq.${pipeline.id}`).order("created_at"),
    supabase.from("stage_required_fields").select("stage_id, field_definition_id").eq("workspace_id", ws).in("stage_id", stageIds),
    // exact counts per stage (a row fetch would be capped by the API row limit)
    Promise.all(stageIds.map((id) => supabase.from("opportunities").select("id", { count: "exact", head: true }).eq("stage_id", id).is("archived_at", null))),
  ]);
  if (fields.error || required.error || countRes.some((c) => c.error)) return { error: true } as const;
  const counts = new Map(stageIds.map((id, i) => [id, countRes[i].count ?? 0]));
  const stages = stagesRes;
  return {
    pipelines,
    pipeline,
    stages: (stages.data ?? []).map((s) => ({
      ...s,
      required: (required.data ?? []).filter((r) => r.stage_id === s.id).map((r) => r.field_definition_id),
      count: counts.get(s.id) ?? 0,
    })) as ConfigStage[],
    fields: (fields.data ?? []).map((f) => ({ ...f, options: Array.isArray(f.options) ? (f.options as string[]) : [] })) as FieldDef[],
  } as const;
}

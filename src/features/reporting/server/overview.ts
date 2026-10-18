import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { SessionContext } from "@/features/identity/server/session";
import type { DashboardOverview, WidgetKey } from "../types";

export async function getOverview(ctx: SessionContext) {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dashboard_overview", { p_workspace: ctx.workspace.id });
  if (error) return { error } as const;
  return { overview: data as DashboardOverview } as const;
}

export async function getHiddenWidgets(ctx: SessionContext): Promise<WidgetKey[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("dashboard_preferences")
    .select("hidden_widgets")
    .eq("workspace_id", ctx.workspace.id)
    .eq("user_id", ctx.user.id)
    .maybeSingle();
  return (data?.hidden_widgets ?? []) as WidgetKey[];
}

/** Open pipeline value across the default pipeline, only for viewers allowed to see values. */
export async function getOpenPipelineValue(ctx: SessionContext) {
  if (!ctx.permissions.includes("opportunity.value.view")) return null;
  const supabase = await createClient();
  const { data: pipeline } = await supabase
    .from("pipelines")
    .select("id")
    .eq("workspace_id", ctx.workspace.id)
    .eq("is_default", true)
    .is("archived_at", null)
    .maybeSingle();
  if (!pipeline) return null;
  const { data } = await supabase.rpc("pipeline_value_by_stage", { p_workspace: ctx.workspace.id, p_pipeline: pipeline.id });
  return ((data ?? []) as { open_value_minor: number }[]).reduce((sum, r) => sum + Number(r.open_value_minor), 0);
}

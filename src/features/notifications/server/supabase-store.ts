import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { EscalationContext, OutboxEvent, OutboxStore } from "./types";

/**
 * Service-role store. Every read is scoped to the workspace carried by the outbox row itself (written by
 * the database in the same transaction as the business change), never to anything from a request.
 */
export function createSupabaseOutboxStore(admin: SupabaseClient): OutboxStore {
  return {
    async claim(limit, leaseSeconds) {
      const { data, error } = await admin.rpc("claim_outbox", { p_limit: limit, p_lease_seconds: leaseSeconds });
      if (error) throw new Error(error.message);
      return (data ?? []) as OutboxEvent[];
    },
    async finish(id, result) {
      const { error } = await admin.rpc("finish_outbox", {
        p_id: id,
        p_ok: result.ok,
        p_reference: result.ok ? result.reference : null,
        p_error: result.ok ? null : result.error,
      });
      if (error) throw new Error(error.message);
    },
    async loadEscalation(event): Promise<EscalationContext | null> {
      const leadId = String(event.payload.lead_id ?? "");
      const toUserId = String(event.payload.to_user_id ?? "");
      const { data: lead } = await admin
        .from("leads")
        .select("id, contact_id, source, summary")
        .eq("id", leadId)
        .eq("workspace_id", event.workspace_id)
        .maybeSingle();
      if (!lead) return null;
      const [{ data: contact }, { data: member }, { data: profile }] = await Promise.all([
        admin.from("contacts").select("name").eq("id", lead.contact_id).eq("workspace_id", event.workspace_id).maybeSingle(),
        admin.from("memberships").select("user_id").eq("workspace_id", event.workspace_id).eq("user_id", toUserId).eq("enabled", true).maybeSingle(),
        admin.from("profiles").select("display_name, notification_email").eq("id", toUserId).maybeSingle(),
      ]);
      if (!member) return null; // only deliver to an active member of this workspace
      return {
        leadId: lead.id,
        contactName: contact?.name ?? "A new lead",
        source: lead.source,
        summary: lead.summary,
        recipientEmail: profile?.notification_email ?? null,
        recipientName: profile?.display_name ?? null,
      };
    },
  };
}

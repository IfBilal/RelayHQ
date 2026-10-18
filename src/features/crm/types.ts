export interface ContactRow {
  id: string;
  name: string;
  email: string | null;
  phone_e164: string | null;
  owner_user_id: string | null;
  opted_out: boolean;
  version: number;
  created_at: string;
  company: { id: string; name: string } | null;
}

export interface StageRow {
  id: string;
  name: string;
  position: number;
  terminal_type: "won" | "lost" | null;
}

export interface OpportunityRow {
  id: string;
  title: string;
  contact_id: string;
  stage_id: string;
  pipeline_id: string;
  currency: string;
  version: number;
  created_at: string;
  contact?: { name: string } | null;
  /** Present only when the viewer holds opportunity.value.view; the key is absent otherwise. */
  value_minor?: number;
}

export interface ActivityRow {
  id: string;
  kind: string;
  body: string | null;
  data: Record<string, unknown>;
  actor_user_id: string | null;
  created_at: string;
}

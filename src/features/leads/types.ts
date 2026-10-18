export interface LeadRow {
  id: string;
  contact_id: string;
  source: "web_form" | "whatsapp" | "manual";
  summary: string;
  owner_user_id: string;
  status: "open" | "closed";
  current_level: number;
  escalation_count: number;
  emergency: boolean;
  assigned_at: string;
  first_assigned_at: string;
  first_acknowledged_at: string | null;
  acknowledged_at: string | null;
  deadline_at: string | null;
  version: number;
  created_at: string;
}

export interface RecoveryRow {
  lead_id: string;
  contact_id: string;
  contact_name: string;
  summary: string;
  source: LeadRow["source"];
  owner_user_id: string;
  owner_name: string | null;
  deadline_at: string | null;
  assigned_at: string;
  escalation_count: number;
  current_level: number;
  reasons: string[];
  version: number;
}

export interface TeamMember {
  user_id: string;
  display_name: string | null;
  base_role: "owner" | "admin" | "user";
  availability: "available" | "busy" | "on_leave" | "offline";
  open_leads: number;
}

export interface AssignmentRules {
  workspace_id: string;
  max_open_leads: number;
  windows_seconds: number[];
  alternate_levels: number;
  backup_user_id: string | null;
  manager_user_id: string | null;
  idle_seconds: number;
  reassign_on_absence: boolean;
  updated_at: string;
}

export const SOURCE_LABEL: Record<LeadRow["source"], string> = { web_form: "Web form", whatsapp: "WhatsApp", manual: "Manual" };

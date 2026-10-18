export interface DashboardOverview {
  serverNow: string;
  timezone: string;
  scope: "company" | "self";
  newLeadsToday: number;
  openLeads: number;
  averageFirstResponseSeconds: number | null;
  escalations24h: number;
  recoveryCount: number;
  availableStaff: number;
  teamSize: number;
  firstWindowSeconds: number;
  responseSeries: { day: string; total: number; withinSla: number }[];
}

export const WIDGETS = [
  { key: "newLeads", label: "New leads today" },
  { key: "recovery", label: "Needs recovery" },
  { key: "response", label: "Average first response" },
  { key: "collected", label: "Collected this month" },
  { key: "escalations", label: "Escalations (24h)" },
  { key: "staff", label: "Available staff" },
  { key: "performance", label: "Response performance chart" },
  { key: "team", label: "Team availability" },
  { key: "attention", label: "Attention required" },
  { key: "agenda", label: "Upcoming appointments" },
] as const;
export type WidgetKey = (typeof WIDGETS)[number]["key"];

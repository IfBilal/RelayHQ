/**
 * Illustrative records used to build screens to the design reference before their backends exist.
 * Every page that imports this shows a "Sample data" note. Delete entries as each domain goes live.
 */
export type Tone = "green" | "amber" | "rose" | "slate";

export const recoveryLeads = [
  { name: "Maya Richardson", request: "Solar consultation request", source: "Web form", owner: "Olivia Chen", timer: "2m overdue", reason: "2 escalations", tone: "rose" as Tone },
  { name: "James Walker", request: "Home battery upgrade", source: "WhatsApp", owner: "Daniel Lee", timer: "54s remaining", reason: "Awaiting response", tone: "amber" as Tone },
  { name: "Sophia Martinez", request: "Commercial rooftop inquiry", source: "Web form", owner: "Sana Ali", timer: "4m overdue", reason: "No activity", tone: "rose" as Tone },
  { name: "Noah Thompson", request: "Roof survey follow-up", source: "Manual", owner: "Olivia Chen", timer: "12m idle", reason: "Idle threshold", tone: "amber" as Tone },
];

export const team = [
  { name: "Olivia Chen", status: "Available", tone: "green" as Tone, note: "2 active leads", avatar: "" as const },
  { name: "Daniel Lee", status: "Available", tone: "green" as Tone, note: "3 active leads", avatar: "" as const },
  { name: "Sana Ali", status: "Busy", tone: "amber" as Tone, note: "4 active leads", avatar: "warm" as const },
  { name: "Jacob Wells", status: "On leave", tone: "slate" as Tone, note: "Not receiving leads", avatar: "blue" as const },
];

export const agenda = [
  { time: "09:30", title: "Site survey · Brightline Solar", who: "Olivia Chen" },
  { time: "11:00", title: "Discovery call · Maya Richardson", who: "Daniel Lee" },
  { time: "15:15", title: "Proposal review · Horizon Group", who: "Sana Ali" },
];

export const pipelineColumns = [
  { name: "New inquiry", dot: "blue", deals: [
    { company: "Brightline Solar", sub: "Roof & battery proposal", value: "$12,800", rep: "Olivia Chen", progress: 77 },
    { company: "Aurora Retail", sub: "Energy consultation", value: "$4,600", rep: "Daniel Lee", progress: 44 },
  ] },
  { name: "Qualified", dot: "teal", deals: [
    { company: "Horizon Group", sub: "Multi-site audit", value: "$18,900", rep: "Sana Ali", progress: 62 },
    { company: "Maya Richardson", sub: "Residential installation", value: "$8,500", rep: "Olivia Chen", progress: 45 },
  ] },
  { name: "Proposal sent", dot: "gold", deals: [
    { company: "SunPeak Homes", sub: "Commercial proposal", value: "$34,200", rep: "Daniel Lee", progress: 85 },
  ] },
  { name: "Negotiation", dot: "blue", deals: [
    { company: "Northstar Estates", sub: "Contract signing", value: "$15,400", rep: "Sana Ali", progress: 95 },
  ] },
];

export const threads = [
  { name: "Maya Richardson", preview: "Can we schedule a quick call?", time: "2m", tone: "warm" as const, owner: "Olivia Chen" },
  { name: "James Walker", preview: "Thanks for getting back to me.", time: "15m", tone: "blue" as const, owner: "Assigned team" },
  { name: "Sophia Martinez", preview: "I would love a quote.", time: "48m", tone: "pink" as const, owner: "Assigned team" },
  { name: "Noah Thompson", preview: "When can you visit the site?", time: "2h", tone: "" as const, owner: "Assigned team" },
  { name: "Brandon King", preview: "The proposal looks great.", time: "3h", tone: "warm" as const, owner: "Assigned team" },
];

export const integrations = [
  { cls: "twilio", letter: "T", name: "Twilio WhatsApp", sub: "Customer messaging & lead capture", last: "Last event · 8 minutes ago" },
  { cls: "stripe", letter: "S", name: "Stripe Payments", sub: "Hosted checkout & payment webhooks", last: "Last event · 1 hour ago" },
  { cls: "google", letter: "G", name: "Google Calendar", sub: "OAuth employee schedules", last: "Last sync · 15 minutes ago" },
  { cls: "resend", letter: "R", name: "Resend Email", sub: "External escalation notifications", last: "Last alert · 2 minutes ago" },
];

export const syncEvents = [
  { provider: "Twilio", event: "Inbound message", ref: "SM••••A92D", at: "10:23 AM", status: "Processed" },
  { provider: "Resend", event: "Lead escalation alert", ref: "eml••••1201", at: "10:42 AM", status: "Delivered" },
  { provider: "Stripe", event: "Checkout paid", ref: "evt••••8a21", at: "09:17 AM", status: "Verified" },
  { provider: "Google", event: "Calendar event created", ref: "evt••••912a", at: "Yesterday", status: "Synced" },
];

export const ladder = [
  { n: 1, title: "Primary available employee", body: "Auto-assign on lead capture using round robin.", chips: [["30 seconds", "green"], ["Available only", "slate"]] as [string, Tone][] },
  { n: 2, title: "Next eligible employee", body: "Reassign automatically when initial response time expires.", chips: [["20 seconds", "amber"], ["Capacity checked", "slate"]] as [string, Tone][] },
  { n: 3, title: "Designated backup", body: "Backup receives lead and external alert.", chips: [["15 seconds", "amber"], ["Email alert", "green"]] as [string, Tone][] },
  { n: 4, title: "Manager / Owner", body: "Escalate for accountability; rescue queue stays visible.", chips: [["Final fallback", "rose"]] as [string, Tone][] },
];

export const routingPreview = [
  { name: "Olivia Chen", sub: "Available · 3/8 open", chip: "NEXT", tone: "green" as Tone, avatar: "" as const },
  { name: "Daniel Lee", sub: "Available · 4/8 open", chip: "Eligible", tone: "green" as Tone, avatar: "" as const },
  { name: "Sana Ali", sub: "Busy · excluded", chip: "Skipped", tone: "amber" as Tone, avatar: "warm" as const },
  { name: "Jacob Wells", sub: "On leave · excluded", chip: "Skipped", tone: "slate" as Tone, avatar: "" as const },
];

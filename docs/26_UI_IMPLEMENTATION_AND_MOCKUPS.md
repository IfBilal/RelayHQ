# Pixel-to-Code UI Blueprint — Premium Business Operations Design

## Theme reasoning grounded in source
The problem statement is about service businesses missing inbound leads, not a sci-fi AI product, personal finance app or a gaming war room. The UI therefore resembles a **quiet, precise operations console**: immediate accountability and action, confident typography, calm background, a focused navy rail and status-specific amber/coral urgency. Avoid superficial dashboards filled with decorative charts, oversized gradients, neon effects or generic stock illustrations.

## Brand concept (proposed)
**RelayHQ — Every lead has an owner.** Navy `#142B35`, deep teal `#127568`, canvas `#F5F7F4`, fog `#E6EFEB`, amber `#B47424`, coral `#BB5049`. These semantic tokens live in `assets/tokens.css` and `docs/03_DESIGN_SYSTEM.md`. Typography Inter Display and Inter with system fallback; consistent tabular numerals for due times/currency.

## Mockup URL navigation
Open `../mockups/index.html` and choose the top left sidebar tabs. Deep links use query `?screen=dashboard|recovery|pipeline|contact|inbox|rules|integrations|appointments`. Open every screenshot in `../screenshots`. HTML prototype uses illustrative data and has no Auth/DB/provider connection; **rewrite using React + Tailwind + shadcn/ui** rather than copying static JS as business logic.

## Build order for B
1. `globals.css` colors, typography, focus rings, radius and responsive primitives.
2. `AppShell`, `Sidebar`, `Topbar`, `MobileBottomNav`, `WorkspaceSwitcher` with correct active page and permission-aware nav.
3. `StatusChip`, `StatCard`, `ActionRow`, `DataTable`, `Avatar`, `SlaClock`, `ActivityTimeline`, `EventLog`.
4. Dashboard + Recovery as initial premium hero screens; pay particular attention to at-risk lead list, explicit due clock and acknowledgment button.
5. Pipeline + Contact 360 data-dense screens; stage controls and custom fields are interactive, not decorative.
6. Inbox + integration health + rule editor + appointment scheduler.
7. Create production empty/loading/error/403/conflict/phone states (prototype shows mostly happy-path illustrative data).

## Screen interaction contracts
| Screen | Headline message | Primary task | Important information |
|---|---|---|---|
| Dashboard | Action before loss | Open urgent leads | New today, recovery, avg response, 24h escalations, pipeline, staff, appointments, revenue |
| Recovery | Nobody falls through cracks | Reassign/Acknowledge | Reason, due/overdue duration, owner, source, escalation count |
| Pipeline | Opportunity progress | Move stage | Validated required fields, money permission, saved filters |
| Contact 360 | One complete history | Message/Book/Payment | Contact/company, lead owner, opportunities, conversations, paid/pending, appointments, activity |
| Inbox | Respond in one place | Send reply | Conversation owner, delivered/failed state, opt-out, retry |
| Rules | Make ownership predictable | Save routing policy | Availability, capacities, round-robin, timeline levels and backup |
| Integrations | Trust real connections | Connect/Recover | Health, timestamp, specific provider error, sync log |
| Appointments | Book with confidence | Book verified free slot | Google connect status, busy conflicts and timezone |

## Responsive behavior
Desktop 1440px: 246px fixed navy rail, 70px topbar, at most four metrics across. Tablet: rail collapses, cards 2 columns. Mobile 390px: bottom action nav, text hierarchy remains, recovery cards show **urgency, owner, due time and action before secondary metadata**; no page-level horizontal scroll. Pipeline may scroll **within board only**; accessible list alternative required.

## Accessibility and honest interface states
Minimum 40px target preferred. WCAG AA contrast and semantic alerts (icon+text) without color-only encoding; keyboard navigation and focus-visible. Explicit connection/loading/send failure/retry states, auth restricted state and provider sandbox limitation. Live counters must derive from Supabase/Postgres; static placeholders are prohibited in deployed “live” screenshots.

## Suggested component tree
```text
AppShell
  Sidebar / MobileNav / TopBar
  PageTitle + Context + PrimaryAction
  StatusBanner? (when relevant)
  MetricGrid or Controls/SearchFilters
  Section cards / DataTable / Kanban / Thread
  Context drawer / Modal / ActivityPanel
```

## UI QA release gate
B provides full-size screenshot + mobile screenshot for each core screen; compare against prototype, scan broken type line-wrapping, contrast, focus and status ambiguity. A/C confirm role permission and real data origin for every displayed field. Do not let polished mockups replace API wiring or negative tests.

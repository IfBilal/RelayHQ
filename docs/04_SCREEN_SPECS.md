# Screen-by-Screen UI/UX Specification

## Screens supplied
Open `../mockups/index.html`; PNG exports are in `../screenshots/`. The sample rows are **illustrative** until backend-connected. Every page must support sidebar/topbar responsive behavior and permissions.

| Code | Route | Primary persona | Required action and data |
|---|---|---|---|
| S01 | `/dashboard` | Owner/Manager/User | Health banner, KPIs, urgent leads, employee availability, appointment and payment summaries |
| S02 | `/leads/recovery` | Manager | Overdue, repeated escalation, idle with cause, owner, due, bulk/row review |
| S03 | `/pipelines/:pipelineId` | Rep/Admin | Stage board/list, filtered values, keyboard stage edit, required-field guard |
| S04 | `/contacts/:id` | Everyone with view | Complete customer view: company, owner, deals, timeline, chat, payments, appointments |
| S05 | `/inbox` | User/Manager | Conversation list, assigned employee, opt-out, delivery state, failed retry |
| S06 | `/settings/assignment` | Admin | Rules, quotas, available-only round robin, backup, manager, deadlines, dry-run |
| S07 | `/settings/integrations` | Admin | Four real providers, connect/health, time last worked, recent errors, history |
| S08 | `/appointments` | User | Google connection, busy slots, timezone and booking with contact association |

### Additional required production screens (no PNG needed before P0 APIs)
S09 `/login`, `/signup` and invite acceptance; S10 `/contacts` paginated table+saved filters; S11 `/opportunities/:id` detail/payment; S12 `/settings/fields` metadata/stage editor; S13 `/team` availability + role editor; S14 `/audit` filterable immutable history; S15 `/settings/profile` per-user email escalation routing; S16 `/leads/new` manual capture; S17 `/f/:workspaceSlug` rate-limited public lead form; S18 `/settings/integrations/:provider/events` inbound/outbound synchronization logs.

## Interaction contracts
**Dashboard:** Click recovery KPI → `GET /v1/leads?recovery=true`. Click stage value → filtered opportunities list only if value-view permitted. User sees own counts and no company-sensitive totals. Live status receives Supabase Realtime event and invalidates matching Query keys.

**Recovery:** Sort by highest risk. Row action “Open lead” or “Reassign”. Reason chips distinguish unacknowledged deadline, 2+ escalations, idle. Escape overdue lead counter uses text. “Acknowledge” visible only to current owner or granted manager; stale writes → 409 with fresh owner shown.

**Pipeline:** Display stage totals only with `opportunity.value.view`. Drag is optional enhancement, semantic `Move to stage` dropdown **mandatory**. Before stage move, display missing stage-specific required fields. Remove stage only with migration wizard for existing opportunities.

**Contact 360:** Two columns desktop, stacked mobile. Activity union keyed by timestamp, actor and event; message failures, payment refund and calendar event distinct. `Opportunity value` field itself absent from JSON if no permission (not masked only by CSS). Composer disabled with opt-out reason.

**Inbox:** Keyboard: up/down conversation list, Enter open, Ctrl/Cmd+Enter send when supported, retry failed send. Outbound message appears `pending` then provider status; provider rejection appears as failure with actionable retry. Cross-workspace conversation ID yields nonexistence.

**Assignment editor:** Persist rules to DB and show “Last modified by” audit. Dry-run sample includes current employee availability and caps. Counter-intuitive fallback explicitly flagged “emergency owner” rather than pretending an offline user is available.

**Integrations:** Each provider has different connection flow. Never show credentials, tokens or full error payload if secret-like. “Last webhook” differs from “Last successful sync”. Connect/disconnect requires permission and audit.

**Appointments:** Google FreeBusy preflight, show user's IANA timezone, conflict warning, recheck before insert, event appears in contact history. Connected UI requires valid server-side credential; expired OAuth shows reconnect CTA.

## UI state matrix (repeat per screen)
| State | Visual contract | API behavior |
|---|---|---|
| Loading | Skeleton dimension stable; disable destructive actions | Abort stale requests |
| Empty (fresh) | Helpful copy and one clear create/connect action | 200 + [] |
| Empty (filtered) | Clear filters CTA | 200 + [] |
| Error | Human-friendly explanation and retry | 4xx/5xx caught |
| Forbidden | No sensitive preloaded data visible | 403/404 |
| Conflict | Show updated record and next action | 409 + machine code |
| Success | Small toast, optimistic UI only with rollback | 2xx and invalidate query |
| Realtime reconnect | “Reconnecting…” subtle banner, re-fetch on reconnect | Supabase Realtime with reconnect semantics |

## Responsive per page
- Dashboard: 4→2→1 metrics; at <768 collapse secondary activity rail, keep urgent recovery at top.
- Recovery: table on desktop; each mobile lead renders information card with one primary action.
- Pipeline: maintain short cards; mobile horizontally scroll through stages; alternate list toggle always visible.
- Inbox: mobile list → conversation detail navigation (not microscopic 3 columns).
- Settings: mobile tabs turn into stacked cards; form fields always one column.

## Claude implementation instruction
Do not implement screenshot pixels as an absolute-positioned canvas. Use semantic `header`, `nav`, `main`, `section`, typed fixtures, CSS grid/flex, the shared design tokens, and actual server responses. An API's loading/denied/empty states should be added while implementing each screen, not postponed.

# Product Requirements Document — RelayHQ

## 1. Vision, audience and success
**One connected workspace** for 5–30-person service businesses (real estate, solar, service clinics) that turns every inbound lead into an owned, trackable process. Audiences: Owner, Admin, permission-based Manager, User/rep, and external customer. Distinguish internal operator screens from customer touchpoints.

### Product goals
- No lead is ever silently ignored; assignment, acknowledgement and escalation are unambiguous.
- CRM structures change without schema changes or a developer (pipeline stages, field definitions and saved dynamic lists).
- Real two-way messaging, hosted checkout, Google appointments and email escalation notifications are attached to the contact timeline.
- Permissions and tenant boundaries hold even under raw API requests and export.
- Operational dashboards show actions and traceable metrics, not vanity graphics.

### Non-goals
Accounting, payroll, leave legislation, marketing analytics, billing for RelayHQ, public marketing site, AI chatbot, multi-pipeline automation engines or full BI builder. **One customizable pipeline is mandatory**; acceptance F2.3 asks two pipelines with different fields, so implement multiple pipeline records with one active/default pipeline per workspace rather than artificially constraining to exactly one.

## 2. Personas and permissions
| Persona | Primary job | First-screen question | Actions |
|---|---|---|---|
| Owner | Protect revenue and accountability | What's at risk? | Audit, workspace, settings, all records |
| Admin | Configure systems | Are routing and integrations healthy? | Fields, rules, credentials, invites as delegated |
| Manager (permission preset) | Coordinate team | Who needs help now? | Team/recovery/reassign |
| User/rep | Respond and close | What do I need to act on next? | Own permitted leads/inbox/payments/appointments |
| Customer | Get timely service | Did someone answer/book/confirm? | External WhatsApp, web lead form, Stripe checkout, calendar invite |

## 3. Functional epics and release slices
**P0:** F1 auth and isolation, F2 CRUD + dynamic fields/stages, F3 lead lifecycle, F4 immutable audit, F5 role-aware dashboard, I1 Twilio, I2 Stripe, I3 Google OAuth/Calendar, I4 Resend email, I5 integrations health, Q1–Q14. The source problem calls all of these mandatory; P0 indicates competition acceptance, not a promise to omit complicated requirements.

**Slice A (working spine):** sign up → workspace → contact → manual lead → assignment → acknowledge → audit → dashboard.
**Slice B (primary differentiator):** capture → timed escalation → external email notification → recovery → restart/concurrency proof.
**Slice C (connected business):** incoming WhatsApp → contact match/create → owner → outbound reply; Stripe hosted test checkout → signed webhook → revenue; calendar OAuth → busy check → appointment.
**Slice D (polish):** saved filters, custom fields per pipeline, role-aware mobile views, integration sync console, robust failures.

## 4. Full acceptance journeys
1. Owner signs up and obtains fresh workspace; refresh retains session; invites Admin/User; tries prohibited role mutation as Admin; server rejects.
2. Admin creates pipeline A + B, unique field definitions and stages; move requiring missing field is blocked; deleting populated stage requires explicit migration.
3. Public form leads, manual leads and unknown WhatsApp sender generate source-labelled leads; all have accountable assignee, even emergency fallback.
4. Assign only to `Available` below open-lead limit via round-robin. Employee acknowledges or acts before deadline; pause escalation; demonstrate no duplicate assignment under two worker invocations.
5. Change an owner Offline/On leave and prove immediate routing; show policy for previously acknowledged leads; trigger 2+ escalations and recovery reasons.
6. Trace assignment, note, stage, chat, payment and appointment chronologically from Contact 360.
7. User without `opportunity.value.view` sees neither money in API list/detail nor CSV. Workspace B guessed identifiers return 404/denied.
8. Twilio inbound+outbound and status callbacks work with joined sandbox phone. Invalid signature rejected. Duplicate MessageSid not duplicated. Opt-out blocks sends.
9. Stripe Checkout payment updates on genuine signed webhook, not success redirect; failed/expired/refund and duplicate webhooks are processed correctly.
10. Google connected via real OAuth; FreeBusy conflict, create, reschedule, cancel, refresh/reconnect and timezone documented.
11. Email escalation reaches configured employee and retries/logs failures; all four integrations show per-workspace status/log.
12. Dashboard metrics drill into exact records and use revenue from provider-confirmed payments minus refunds.

## 5. UI success metrics
- Owner can find a critical lead and its owner in one screen without opening a menu.
- Rep can acknowledge a lead in ≤2 clicks after opening their work queue.
- Critical recovery queue shows **reason + time + owner + action** before all secondary attributes.
- Pipeline board, contact timeline and integration diagnostics are visually consistent with single semantics for badges.
- 390px layout: no horizontal page scroll; board can have intentionally horizontally scrolling lanes *within* the board.

## 6. Measured business metrics
- New leads today, average first acknowledgement time (as defined in source), recovery queue, escalations last 24h, open opportunity value by nonterminal stage, availability, appointments, collected monthly payments. See `13_DASHBOARD_AND_METRICS.md` for precise SQL semantics and permission-handling.

## 7. Product-wide invariants
- `lead.owner_user_id` non-null, points to same workspace; at most one owner by construction.
- An acknowledgement has `first_acknowledged_at` recorded once; subsequent actions never reset first-response time.
- Provider events are at-least-once: dedupe via unique keys; webhook verification precedes mutation.
- Audit history immutable through application APIs; append within the same DB transaction as business change.
- Saved lists are persisted filter rules, **not snapshots**.
- External provider failure cannot roll back unrelated core business changes.

## 8. Definition of Done
Full testable deployment; test checklist; all module permission checks; error UX; accessibility and responsiveness; live integrations; source-specific feature-to-evidence demonstration. See `22_REQUIREMENTS_TRACEABILITY.md`.

# Phase-by-Phase Definition of Done and Review Gates

## Phase P0 — Research, theme, accounts (W0)
**Input:** full problem statement. **Deliver:** brand/UI direction, F/I/Q coverage map, provider access, demo story. **Pass:** theme answers business need; Twilio joined phone + Stripe dashboard + Google test users + Resend sender availability all verified or blockers logged. **Parallel:** B visual work, A infra planning, C providers.

## Phase P1 — Foundation/contracts/security spine (W1)
**Deliver:** monorepo, DB/Supabase Cron, health checks, typed shared schemas, workspace/signup/login/roles, UI shell. **Pass:** cold clone starts; Owner workspace created; login persists; tenant/permission tests pass. **Must precede:** all protected business endpoints. **Parallel:** B UI components after brand freeze; C CRM service stubs only after DTO freeze.

## Phase P2 — CRM data and lead intake (W2–W3)
**Deliver:** contacts/company/opportunities relationships, pipeline metadata, public/manual lead routes, available/cap aware RR assignment, acknowledge, first audit. **Pass:** 2 workspaces isolated, three simultaneous lead intakes keep one owner each, UI can complete real lead via API. **Must precede:** worker and external lead ingress.

## Phase P3 — Automation/recovery + custom CRM (W4)
**Deliver:** durable deadline/outbox, escalation chain, absence triggers, recovery queue; 2 different pipelines/field definitions, stage required and deletion handling, dynamic saved 3-filter lists. **Pass:** two worker concurrency produces exactly one reassignment; stop/restart worker catches up; UI shows recovery reasons. **Parallel:** A worker, B pipeline/contact UI, C field metadata.

## Phase P4 — Real messaging and realtime (W5)
**Deliver:** Twilio signed inbound/outbound/status + dedupe/opt-out/failure, Supabase Realtime invalidation, conversation UI. **Pass:** real phone ↔ platform and contact link; invalid signature rejected, duplicate SID once, lead update appears without manual refresh. **Must precede:** “full connected customer view” demo.

## Phase P5 — Payments/calendar/email (W6–W8)
**Deliver:** Stripe hosted test checkout/webhook/failed/refund, Google OAuth/FreeBusy/create/edit/cancel, Resend escalation with retry/log, integrations status. **Pass:** each visible in external provider system; simulated redirects not counted as payment; OAuth reconnect and conflict covered; notification within minute healthy. **Parallel:** A Resend, B UI, C Stripe then Google (serial for C alone).

## Phase P6 — Metrics, audit, UX/security completion (W9)
**Deliver:** all glossary metrics, drilldowns, user-specific layout toggles, export mask, audit filters, responsive/all UI states. **Pass:** arithmetic from known records; deny protected API requests; accessibility smoke, tablet/mobile tested; 500-record queries paginated.

## Phase P7 — Release + judging readiness (W10–W11)
**Deliver:** HTTPS deployed API/web/worker, real test provider callbacks, dry-run with seeded realistic data, completed traceability matrix, fallback accounts. **Pass:** unfamiliar team member follows README and demo script with no secret leaks or local code changes. Freeze then only hotfixes.

## Unambiguous sign-offs
A signs data integrity, auth, concurrency and deployment. B signs design consistency, states, responsiveness and accessibility. C signs real sandbox integrations, credential hygiene and CRM business behavior. **All three** sign full judge run-through. No phase is complete just because a page looks finished.

**Updated stack gate:** each phase must run on Next.js + Supabase Auth/SQL/RLS; no Express, Prisma, Redis, BullMQ or client-only timers. Refer to `16_END_TO_END_IMPLEMENTATION_PLAN.md` for the revised session order.

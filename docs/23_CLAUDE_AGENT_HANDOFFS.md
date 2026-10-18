> **Architecture override (confirmed):** Use **Next.js App Router + Supabase PostgreSQL/Auth/Realtime/Cron**, **NO Express/Prisma/Redis/BullMQ**. Read `06_TECHNICAL_STACK.md`, `24_SUPABASE_RLS_AND_AUTH.md`, `25_SUPABASE_SQL_AND_TRANSACTIONS.md` before any task. Supabase SQL migration ownership is A. Any generic “worker” mention below means the Supabase Cron-triggered SQL/outbox dispatcher.

# Claude / AI Coding Assistant Handoff Playbooks

## Guiding principle
AI coding sessions must not start from “build the whole CRM.” They need a small, testable file boundary, accepted design system, existing contracts and explicit definition of done. Agents working on separate laptops must read **the same docs/commit** and should **not independently alter the same schema or contract**.

## Universal preamble (paste at every session)
```text
You are implementing RelayHQ, a multi-tenant service-business CRM that prevents missed leads.
Read docs/00_START_HERE.md, docs/01_PRD.md, docs/02_PRODUCT_DESIGN_BRIEF.md,
docs/03_DESIGN_SYSTEM.md, docs/05_ARCHITECTURE.md, docs/08_API_CONTRACTS.md,
docs/09_SECURITY_THREAT_MODEL.md, docs/16_END_TO_END_IMPLEMENTATION_PLAN.md,
and the task-specific docs. Consult the source problem statement for F/I/Q IDs.
Do NOT invent provider success, skip workspace scoping, or make unsanctioned schema/contract changes.
Use TypeScript strict; add positive and negative tests; follow theme tokens and exact API contracts.
First summarize dependencies/files/routes/permissions/acceptance. Implement only assigned branch.
At the end report edited files, commands run + actual results, unresolved blockers, screenshots if UI,
and PR-ready summary. Do not claim tests you have not run.
```

## Developer A — Auth + lead engine sample session
```text
Branch feat/lead-escalation-worker. Preconditions: lead intake and assignment rules are merged.
Read docs/07_DATA_MODEL.md, docs/10_LEAD_ASSIGNMENT_ENGINE.md, docs/14_JOBS_REALTIME_AND_OBSERVABILITY.md.
Implement DB-authored lead deadlines, transactional worker evaluation with expected version,
unique escalation attempt record, backup/manager/Owner emergency fallback, recovery reasons,
worker startup catch-up scan, outbox event; do not send emails in DB transaction.
Add integration tests for 2 simultaneous expiry jobs, acknowledge racing timer, restart catch-up,
no eligible assignee. Deny tenant-crossed IDs. Document any schema changes in A-owned migration.
Acceptance: precisely one owner/audit escalation under replay; no lost lead after worker restart.
```

## Developer B — UI specification sample session
```text
Branch feat/ui-recovery-queue. Preconditions: tokens+AppShell+lead DTO merged.
Read docs/02_PRODUCT_DESIGN_BRIEF.md, docs/03_DESIGN_SYSTEM.md,
docs/04_SCREEN_SPECS.md and view mockups/index.html?screen=recovery and screenshots/02_recovery_desktop.png.
Build semantic responsive Recovery screen with status, owner, duration, reason and explicit action.
Use shadcn/ui + Tailwind variables; no emoji icons, no fake success; connect typed GET /v1/leads?recovery=true.
Support loading, empty, filtered empty, error/retry, 403 and stale 409 on reassignment.
Write Playwright at 1440x900 and 390x844 and keyboard smoke.
Acceptance: urgent lead visible without scrolling and key action reachable on phone.
```

## Developer C — Stripe sample session
```text
Branch feat/stripe-payments. Preconditions: CRM Opportunity API and integration tenant credential model merged.
Read docs/12_EXTERNAL_INTEGRATIONS.md, docs/09_SECURITY_THREAT_MODEL.md,
docs/13_DASHBOARD_AND_METRICS.md and provider official docs.
Implement real Stripe TEST hosted checkout from opportunity (minor-unit amount) and store pending record.
Verify Stripe-Signature using raw request body and per-workspace integration webhook secret.
Dedupe provider event ID, handle paid/expired/failed/refund/partial refund safely across ordering.
Never treat browser return as paid and never store card information. Include actor/opportunity/contact/reference.
Write signed webhook integration and replay tests, cross-tenant payment attempt test, real test evidence checklist.
```

## UI QA agent (after every visual PR)
```text
Audit this PR against the product-specific theme, not generic pretty SaaS.
Check typography, exact semantic colors, rail/spacing/cards, lead urgency prominence,
real loading/empty/error/permission states, keyboard and 390px mobile usability.
Do not approve decorative charts that distract from rescue actions or hidden money field leaks.
Return a checklist of differences from mockups and concrete file-level improvements.
```

## Integration review agent (after each provider PR)
```text
Read docs/12_EXTERNAL_INTEGRATIONS.md and docs/09_SECURITY_THREAT_MODEL.md.
Threat-model provider callback authentication, tenant credential selection, idempotency, retry,
raw-body handling, out-of-order events, redacted logs and whether failure is visible.
Indicate exactly which behavior has a real sandbox test and which uses mocked contract tests.
No automatic “approved” output without actual test evidence.
```

## How to open multiple sessions safely
Create branches from one main commit; assign separate directories/PRs; pass branch + task + file docs links to each Claude instance. Only A merges migrations; contracts freeze in mini PR. When a conflicting change needed: agent stops and writes a `CONTRACT_CHANGE_REQUEST` comment detailing exact DTO/migration; team approves prior to coding. Merge in dependency order; rerun typecheck and security tests on main. See `18_PARALLEL_WORK_AND_GIT.md`.

## Three quick task templates
**Design:** “Implement S01 dashboard from approved HTML mockup and tokens. Supply desktop/mobile screenshots, semantic components, role-aware states; no mocks in production fetch layer.”
**Backend:** “Implement F3.5/F3.8 from state machine with real Postgres tests; report race evidence.”
**Full flow:** “Bind customer 360 to conversations+payments+appointments with permission gating and chronological real activity. Test a lead→message→Stripe webhook→calendar event timeline.”

## Agent output contract
```md
### Completed requirement IDs
### Files changed and decisions
### API and database changes (if any)
### Tests actually executed and results
### Screenshots / provider event evidence (if applicable)
### Known limitations and TODOs
### PR dependencies and merge order
```

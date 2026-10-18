# HANDOFF — read this first (for the next developer and their Claude Code)

Written 2026-10-18 by the previous Claude Code session, which worked as the **only developer** for the whole build so far. This file is the single entry point for anyone (human or AI) continuing the project. Read it fully, then read the docs it points to for whatever task you pick up. **Do not guess: the specs in `docs/` are the source of truth, and this file says where the code deviates from or interprets them.**

---

## 1. What the project is

**RelayHQ** (provisional name) is a multi-tenant lead-protection CRM for 5–30 person service companies (solar installers, real-estate agencies, clinics). The business problem: inbound leads get answered late or never. RelayHQ guarantees that **every lead has exactly one accountable owner at all times, and escalates automatically if nobody acknowledges it**, while giving the company a customizable CRM, real messaging (Twilio WhatsApp), payments (Stripe), calendar (Google) and email alerts (Resend), with every action audited.

- Source of truth for requirements: `problem statement.md` (IDs F1–F5, I1–I5, Q1–Q14). It is a hackathon-style brief: **real third-party integrations in sandbox mode are mandatory** and fixtures do not count as evidence.
- Specs: `docs/00_START_HERE.md` → everything else. The most useful: `16_END_TO_END_IMPLEMENTATION_PLAN.md` (session plan S00–S21), `07_DATA_MODEL.md`, `24_SUPABASE_RLS_AND_AUTH.md`, `25_SUPABASE_SQL_AND_TRANSACTIONS.md`, `10_LEAD_ASSIGNMENT_ENGINE.md`, `12_EXTERNAL_INTEGRATIONS.md`, `13_DASHBOARD_AND_METRICS.md`, `22_REQUIREMENTS_TRACEABILITY.md`.
- Visual reference (do not copy the static JS): `mockups/index.html`, `screenshots/*.png`, `assets/tokens.css`, `assets/app.css`.
- Repo rules for any AI agent: `CLAUDE.md` (project root). Follow its "Non-negotiable rules" literally.

## 2. Stack and architecture (as built)

| Layer | Choice |
|---|---|
| App | Next.js 16 App Router, TypeScript strict, **Cache Components enabled** (see gotchas), React 19, Tailwind v4 + shadcn/ui (base-ui) + Lucide |
| Data/Auth | Supabase (Postgres, Auth with `@supabase/ssr` cookies, RLS, pg_cron). Realtime not wired yet |
| Validation | Zod 4 on the server for every input |
| Tests | Vitest (unit), pgtap-style SQL tests in `supabase/tests`, manual Playwright scripts in `tests/e2e/manual` |
| Hosting plan | Vercel (not deployed yet) + Supabase cloud |

Key design decisions already implemented (keep them):

1. **Tenant isolation**: every tenant table has `workspace_id`, RLS enabled, explicit column-level GRANTs, composite `(workspace_id, id)` foreign keys. Identity comes from `supabase.auth.getUser()` (see `src/features/identity/server/session.ts`), never from request bodies.
2. **Writes go through SQL functions, not table grants.** Pattern: `private.<fn>` is `SECURITY DEFINER`, `SET search_path = ''`, checks permission itself via `private.require_permission(workspace, permission)` (non-members get `P0002` not-found, members without the permission get `42501`), writes the audit row in the same transaction. A thin `public.<fn>` **SECURITY INVOKER** wrapper exists only so PostgREST can call it. Wrappers are `revoke`d from `public, anon` and granted per role. There is no generic privileged RPC.
3. **Opportunity money** lives in `private.opportunity_financials` (no grants to any API role). It is only reachable via `public.opportunity_values` / `public.pipeline_value_by_stage`, both gated by `opportunity.value.view`. The `opportunities` table has no value column, so no `select('*')` can leak it. In TypeScript the `value_minor` key is **omitted** (not masked) when the viewer lacks the permission.
4. **Lead engine is database-owned.** Deadlines are persisted (`leads.deadline_at`). A pg_cron job (`escalate-due-leads`, every 5 seconds) runs `private.escalate_due_leads()`. There are no `setTimeout`/`setInterval` for business logic anywhere (the only `setInterval` is the display-only countdown component).
5. **Outbox**: notifications are queued in `public.outbox_events` in the same transaction as the business change. A server route drains it (`/api/jobs/dispatch-outbox`) and sends via a provider interface; provider calls never happen inside a DB transaction.
6. **Error contract**: SQL functions raise specific SQLSTATEs which `src/contracts/errors.ts` maps to the HTTP envelope: `28000→401, 42501→403, P0002→404, 23505→409, P0409→409 (stale version/blocked change), P0422→422 (required stage fields, with JSON in DETAIL), 22023/23503/23514→422, P0429→429`.
7. **Optimistic concurrency**: rows carry `version`; mutations take `expectedVersion` and fail with 409 instead of overwriting.

## 3. Repository map

```
src/app/(auth)/            login, signup, onboarding pages
src/app/(app)/             authenticated app: dashboard, leads, leads/recovery, leads/new, leads/[id],
                           contacts, contacts/new, contacts/[id], pipelines/[pipelineId], opportunities/new,
                           settings/assignment, settings/integrations (SAMPLE), inbox (SAMPLE), appointments (SAMPLE), audit
src/app/(public)/f/[slug]  public lead form (anonymous)
src/app/api/v1/...         REST routes (auth, workspaces, contacts, opportunities, pipelines, leads, assignment/rules,
                           team, dashboard, audit, public/forms/[slug]/leads)
src/app/api/jobs/dispatch-outbox   cron-called outbox drain (needs service-role key + Resend)
src/components/relay/      app shell + UI kit ported from the mockups (kit.tsx, app-shell.tsx, icons.tsx, toast.tsx, inbox-view.tsx)
src/styles/relay.css       the mockup stylesheet, ported 1:1 (class names like .card .btn .chip .hero .board ...)
src/features/<domain>/     identity, crm, leads, reporting, audit, notifications (+ _sample for fixtures)
src/lib/supabase/          client.ts (browser), server.ts (user-scoped, RLS), admin.ts (service role, server-only)
src/lib/api.ts             requireSession(permission?) + readJson(zod) helpers for route handlers
src/contracts/             errors.ts (envelope + SQLSTATE map), permissions.ts (permission strings)
supabase/migrations/       numbered SQL, the source of truth for the schema (see section 5)
supabase/tests/            SQL behaviour/RLS tests (pgtap style)
tests/unit/                Vitest
tests/e2e/manual/          Playwright scripts that drive system Chrome (see section 8)
```

`src/features/_sample/data.ts` holds illustrative records used by the screens that do not have a backend yet. **Delete entries as each screen goes live.** Every sample screen shows a "SAMPLE DATA" note and unbuilt actions show a toast saying so (`PendingButton`). Never present sample data as live.

## 4. Environment and accounts (current state)

- **Supabase project**: `ubmp-nascon`, ref `erbgznicaddgleqgvjwx`, region ap-southeast-1. This is the **only** database (no local Docker stack was usable: disk space). It is a shared remote project: **never run `supabase db reset` against it.**
- Local env: copy `.env.example` to `.env.local`. Currently set: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. **Not set yet**: `SUPABASE_SERVICE_ROLE_KEY`, `CRON_DISPATCH_SECRET`, `INTEGRATION_ENCRYPTION_KEY`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, all Twilio/Stripe/Google variables. The project owner must supply them; never paste secrets into chat, commits or logs.
- **Auth settings** (dashboard, set by the owner): email provider enabled and "Confirm email" **off** for development. **Turn confirmation back on before the demo** and send real mail through Resend. Advisor warning: leaked-password protection is off (paid-plan feature).
- **Test data in the remote DB** (dev only; delete before the demo): workspace "Dev Test Co" (slug `dev-test-co`) with an Owner `relayhq.devtest@example.com` and a restricted User `relayhq.user2@example.com` (User preset: no `opportunity.value.view`, no audit). Ask the project owner for the shared dev password, or create new users via `/signup`. The assignment windows in that workspace were set to 10 seconds for testing; reset via Settings → Assignment rules.
- **Credential hygiene**: a Supabase personal access token was pasted into an earlier chat. The owner was asked to revoke it. Do not reuse it.
- **Supabase MCP** is configured at local scope for this folder with write access (`claude mcp list` should show `supabase`). It is how migrations were applied (see section 6).

## 5. Database: migrations and what they contain

Applied to the remote project in this order (repo files are authoritative; the MCP assigns its own version stamps, so do not expect identical version numbers in `supabase_migrations`):

| File | Contents |
|---|---|
| `20261018000001_identity_foundation.sql` | `private` schema, permission catalog (21 keys), profiles, workspaces, memberships (Owner/Admin/User + availability), configurable permission roles and grants (Admin/Manager/User presets per workspace), invitations (token stored as sha256), append-only `audit_events` (trigger blocks UPDATE/DELETE/TRUNCATE even for the owner), `create_workspace`, `invite_member`, `accept_invitation`, `change_member_access`, `set_role_permissions`, `set_member_availability` |
| `20261018000002_crm_core.sql` | companies, contacts (E.164 phone unique per workspace, `opted_out`), pipelines, stages (deferrable unique position), field definitions (text/number/date/dropdown/checkbox, per pipeline), stage required fields, opportunities, `private.opportunity_financials`, saved_views, activity_events; functions for pipeline/stage/field management, opportunity create/move/edit, notes, value reads; default pipeline seeded on signup |
| `20261018000003_lead_engine.sql` | assignment_rules, leads, lead_assignment_events (unique `(lead_id, previous_version, cause)`), outbox_events, job_heartbeats, rate limits; routing (`pick_owner`, round robin with cursor + open-lead cap + Available-only), `capture_lead_core`, manual and public capture, acknowledge (explicit or via a recorded action), manual reassign, close, `escalate_due_leads`, absence reassignment, recovery queue with reason codes, team overview, outbox claim/finish, pg_cron schedules |
| `20261018000004_public_form_info.sql` | `public.public_form_info(slug)` so the anonymous form can show the company name |
| `20261018000005_dashboard.sql` | `dashboard_preferences` (per-user hidden widgets), `dashboard_overview()` computing every dashboard figure in SQL |

Semantics worth knowing before you touch the lead engine:

- `leads.deadline_at` is set while the **current assignment** awaits acknowledgement; `acknowledged_at` is the acknowledgement of the current assignment (reset on every reassignment); `first_acknowledged_at` is immutable and is what "time to first response" uses.
- Escalation chain: level 0 primary, levels `1..alternate_levels` alternates (round robin excluding anyone who already held the lead), then the designated backup, then the manager (both must be enabled and Available/Busy), then the workspace Owner as emergency owner (flag `emergency`, reason `NO_ELIGIBLE_EMPLOYEE`). When the chain is exhausted the Owner stays accountable, the deadline renews, no repeat email is queued. `windows_seconds[level]` is the acknowledgement window per level (last entry reused).
- Lock order is always: workspace `assignment_rules` row first, then leads. The worker takes the rules row with `FOR UPDATE SKIP LOCKED` and leads with `SKIP LOCKED`, so overlapping runs cannot double-process.
- Setting a member to On leave/Offline immediately reassigns their **unacknowledged** leads (cause `absence`, not counted as an escalation). Acknowledged leads stay (policy flag `reassign_on_absence`). Disabling a member releases all their open leads.
- Lead visibility: managers (`lead.reassign`) see all; everyone else sees leads they own. Dashboard scope follows the same rule.
- Cron: `escalate-due-leads` runs every 5 seconds, `prune-rate-limits` every 10 minutes. `public.job_heartbeats` shows when the worker last ran.

## 6. How we develop (the workflow that was used — keep it)

1. One branch per task (`feat/...`), small PRs, dependencies first (contracts → migrations/RLS → services → UI → provider tests). The previous session merged each PR itself once green because the owner asked for autonomy: `gh pr create`, wait for `gh pr checks`, `gh pr merge --merge --delete-branch`. **With multiple developers, go back to the review rules in `docs/18_PARALLEL_WORK_AND_GIT.md`: schema and `src/contracts` changes need the platform owner's review, and only one person edits a given migration.**
2. **Migrations**: write the numbered SQL file in `supabase/migrations/`, then apply it to the remote project with the Supabase MCP `apply_migration` (paste the exact file contents). It is atomic: if any statement fails nothing is applied, fix the file, re-apply. Never edit an already-applied migration; add a new numbered one. Every DB change needs: RLS enabled, explicit grants (the Supabase defaults grant everything, so each migration starts with `revoke all ... from anon, authenticated`), composite tenant FKs, and tests.
3. **Testing SQL without a local stack**: the test files in `supabase/tests/*.test.sql` are native pgtap (for `supabase test db` in CI/local). To run them against the remote project without leaving data behind, send them through MCP `execute_sql` in one transaction with these changes: create a temp table `tout(line text)`, prefix every assertion with `insert into tout select ...`, and end with a `DO` block that raises `'RESULTS' || string_agg(line)` so the transaction rolls back and the error text carries the TAP output. The three existing files all pass this way (40 + 40 + 78 assertions). Run `get_advisors` (security) after DDL.
4. **Application checks before every PR**: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`. CI (`.github/workflows/ci.yml`) runs `npm ci`, lint, typecheck, test. (`npm ci` needed `@emnapi/core` and `@emnapi/runtime` pinned as devDependencies to be reproducible on Linux; do not remove them.)
5. **Browser verification**: the Claude-in-Chrome extension was not connected, so Playwright drives **system Chrome** (`channel: "chrome"`, no browser download). See section 8.

## 7. What is DONE (and how it was verified)

Legend: **REAL** = exercised end to end against the live Supabase project and a real browser; **SQL-TESTED** = asserted by SQL tests on the live project; **UNIT** = Vitest only.

| Area | Status | Evidence |
|---|---|---|
| Scaffold, CI, design tokens, app shell, 8 reference screens | done | REAL: all routes render at 1440 and 390 px, no horizontal overflow (after the control-row wrap fix) |
| **F1** signup/login/logout/session, workspaces, Owner/Admin/User, configurable permissions, tenant isolation, server enforcement | done at DB + API level | SQL-TESTED (40) + REAL (signup, login, restricted user flows). **No UI yet for inviting members, editing roles/permissions, or profile settings** (functions and tests exist) |
| **F1.4** value protection | done | REAL: a restricted user sees no money in board HTML, contact page, list/detail API payloads, and is refused (403) when setting a value |
| **F2** contacts/companies/opportunities, pipelines, custom field definitions, stage-required fields, safe stage delete, optimistic versions, notes/activity | DB + API done; **UI partial** | SQL-TESTED (40). REAL in browser: create contact, duplicate phone rejected, search, create opportunity with value, move stage, note on timeline. **Missing UI**: custom-field editor, stage editor/reorder/delete wizard, required-field editor, dynamic custom fields on opportunity forms/details, saved lists/filters UI |
| **F3** lead capture (public form, manual), availability, round robin + cap, acknowledgement, escalation chain, absence reassignment, recovery queue, no double action | done | SQL-TESTED (78: routing, caps, emergency fallback, dedupe, throttling, exactly-once escalation, stale-owner rejection, absence, visibility, RLS). REAL: public form → one owner → cron escalates by itself (~16 s with a 10 s window; scheduler tick is 5 s) → new owner acknowledges in the UI → no further escalation |
| **F3.9 / I4** external alert via Resend | **code only** | UNIT contract tests with an in-memory provider. **Never sent a real email** (needs `RESEND_API_KEY`, verified sender, service-role key, a deployed or tunnelled URL and a cron→endpoint schedule). Do not claim this works until a real inbox receives it |
| **F4** audit log | done | append-only enforced by trigger; REAL: audit page lists events, event-type filter works, API has no write/delete route (405), restricted user gets 403. Filters by person and date are implemented but only the event-type filter was exercised in the browser |
| **F5** dashboard | done on the branch `feat/dashboard-audit` (see section 10) | SQL figures were compared to raw records (match). Role-aware scope, widget hide/show persists, drill-down from "New leads today" implemented; first browser pass had timing-related script failures and was not re-run to completion |
| Q10 states, Q7 responsive, Q8 a11y | partly | loading/empty/error/403 states exist on the screens built; no automated axe or keyboard tests yet |
| Q9 performance | partly | keyset pagination for contacts and audit; no 500-record fixture or timing test yet |
| **I1 Twilio, I2 Stripe, I3 Google Calendar, I5 integrations center** | **NOT STARTED** | `settings/integrations`, `inbox`, `appointments` are static sample screens. No provider code, tables (`integration_connections`, `integration_events`, conversations, messages, payments, appointments) or webhooks exist |
| Q11 Realtime | NOT STARTED | countdowns tick client-side from `deadline_at`; pages refresh via `router.refresh()` after actions only |
| Q5 concurrency proof | partly | the engine is built for it (SKIP LOCKED, version checks, unique event key) and tests prove sequential exactly-once, **but no test runs two real concurrent sessions yet** |

## 8. Running things

```bash
npm ci
cp .env.example .env.local        # fill in values (ask the project owner)
npm run dev                       # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```

Manual browser scripts (system Chrome required; password comes from env, never hard-code it):

```bash
E2E_PASSWORD=... node tests/e2e/manual/e2e_crm.mjs <outDir> <ownerEmail> <password>
E2E_PASSWORD=... node tests/e2e/manual/e2e_restricted.mjs <userEmail> <password>
E2E_PASSWORD=... node tests/e2e/manual/e2e_leads.mjs <outDir>   # edit the emails inside; takes ~1 minute; needs the dev server up
```

They are throwaway verification scripts, not a test suite. Turning them into proper Playwright specs under `tests/e2e` (with a config that uses `channel: "chrome"` or installed browsers and a seeded fixture workspace) is part of the hardening work.

**Dev-server gotcha**: never use `pkill -f "next dev"` from the same shell command that contains that text (it kills your own shell). Find the PID with `ss -ltnp | grep :3000`.

## 9. Gotchas that cost time (so they don't cost you time)

- **Cache Components** is on: any component reading `cookies()`/Supabase must sit inside a `<Suspense>` boundary. The `(app)` layout wraps its async shell in Suspense; pages inherit it. Pages using `searchParams` are async server components inside that boundary.
- `next dev` regenerates `AGENTS.md` and prints a dev-only "Date.now() while prerendering" notice. Both are harmless; the production build is clean.
- **PL/pgSQL**: an `IF` condition ends at the first `THEN`, so never put a `CASE ... THEN` inside an `IF` condition; assign it to a variable first. pg_cron minute-level schedules need cron syntax (`*/10 * * * *`); sub-minute uses `'5 seconds'`.
- PostgREST returns composite-FK embeds unreliably, so related names are fetched with a second query (`withCompanies`, `lookup`).
- Supabase default privileges grant `ALL` to `anon`/`authenticated` on new tables and functions: always revoke first, then grant narrowly. `alter default privileges in schema private ...` already revokes function execute there.
- RLS policy subqueries must qualify outer columns (`lead_assignment_events.workspace_id`), otherwise the inner alias shadows them and the policy becomes a tautology (this was caught in review once).
- `supabase-js` result objects that are unions need `if (result.error)` narrowing, not `"error" in result`.
- Do not use the service-role client for anything a user-scoped client can do. The public lead form deliberately uses the **anon key** and a fixed-purpose function that validates and rate-limits inside the database.

## 10. State of git at handoff

Merged to `main`: PR #1 scaffold, #2 identity, #3 UI shell and screens, #4 CRM core, #5 lead engine.
The dashboard + audit work (migration 5 is **already applied to the remote project**, plus API routes, `/audit`, `/dashboard`, `/leads?created=today`) was committed on `feat/dashboard-audit` and a PR was opened at the very end; check `gh pr list`. If it is still open, run the four checks, re-run the dashboard browser script (`tests/e2e/manual/e2e_dash.mjs`, wait for `.hero` after login and scope `main` to `main.main`), then merge.

## 11. What is LEFT, in the order I recommend

Follow `docs/16_END_TO_END_IMPLEMENTATION_PLAN.md`; below is the remaining work mapped onto it, with the work split suggested for **two or three people** (lanes from `docs/18_PARALLEL_WORK_AND_GIT.md`).

### Lane A — platform, security, lead engine (owns migrations and `src/contracts`)
1. **Team and roles UI + invite flow (F1.2/F1.3)**: `/team` page: list members, invite by email (server generates a random token, stores only its sha256 via `invite_member`, emails the link), accept page `/invite?token=`, role/permission matrix editor (`set_role_permissions`, `change_member_access`), availability management. Functions and tests already exist; add API routes (`/api/v1/team/invitations`, `/api/v1/team/[userId]/roles`) and UI. Also `/settings/profile` (display name, timezone, **notification email** used for escalation emails: column `profiles.notification_email`, already RLS-editable).
2. **Realtime (S12, Q11)**: add `leads`, `activity_events` (later `messages`, `payments`) to the `supabase_realtime` publication, subscribe in a client component, **invalidate/refresh and re-read through RLS** (send ids only). Show a "reconnecting" state. Leave the 15–30 s polling fallback.
3. **Outbox dispatch end to end (I4)**: needs the service-role key, `CRON_DISPATCH_SECRET`, Resend key and a verified sender. Schedule a pg_cron job that calls `POST /api/jobs/dispatch-outbox` through `pg_net` (installed) with the bearer secret once there is a public URL. Prove a real email within 60 s of an escalation; capture evidence. Show failed alerts to admins (the `outbox_events` select policy already allows `integrations.manage`).
4. **Concurrency tests (Q5, T-LEAD-03/04)**: two real sessions racing `escalate_due_leads` and acknowledge-vs-expiry. Needs `dblink` or two `pg` clients against a local Supabase stack (`supabase start`) in CI.
5. **Deployment (S19)**: Vercel project, env vars, Supabase auth redirect URLs, public HTTPS URLs for webhooks, seed script (`supabase/seed.sql`: Atlas Solar + Beacon Realty fixtures per `docs/27`), README cold-start instructions (Q13), secret scan in CI.

### Lane B — UI / UX
1. Replace the remaining sample screens as their backends land: Inbox (needs lane C messaging), Appointments (calendar), Integrations center, the contact "payments" and "appointments" cards.
2. **CRM configuration UI (F2.2–F2.6)** on top of the existing functions: custom-field designer, stage editor (add/rename/reorder/delete with the migration wizard that shows the 409 blocker report), required-fields editor, dynamic fields rendered on opportunity create/detail (the server already validates types and enforces required fields with a 422 that lists the missing fields), second pipeline creation, **saved lists** (filter AST with allow-listed fields/operators; table `saved_views` exists; AST must be validated with Zod and translated to parameterized queries, never interpolated), pipeline list view toggle, keyboard drag alternative already present as the stage select.
3. States and accessibility pass: every screen needs loading, empty, error, 403 and conflict states, keyboard operation, no horizontal scroll at 390 px; add axe checks. Mobile tables are scroll containers right now; the design asks for card layouts on phones.
4. Real Playwright specs and screenshots for 1440/768/390.

### Lane C — CRM domain and providers (needs the credentials listed in section 4)
1. **Twilio WhatsApp (I1, S11)**: tables `integration_connections` (credentials encrypted with `INTEGRATION_ENCRYPTION_KEY`, opaque public `endpoint_id`), `integration_events` (unique `(integration_id, provider_event_id)`), `conversations`, `messages` (status queued/sent/delivered/failed, error, `provider_sid` unique, opt-out). Route handlers `/api/webhooks/twilio/[endpointId]/messages` and `/status`: read form body, verify `X-Twilio-Signature` over the exact public URL **before any write**, dedupe on `MessageSid`, match contact by E.164 within the workspace or create contact + lead through the existing `private.capture_lead_core` (source `whatsapp`, `source_ref` = MessageSid), outbound sends via the outbox with retry and visible failure, server-side opt-out block. Note: the Twilio sandbox is shared, so map it to one demo workspace and say so in the UI (I5.6).
2. **Stripe (I2, S13)**: hosted Checkout from an opportunity (amount snapshot in minor units, `payment_requests` + `refunds` tables), webhook with **raw body** signature verification, dedupe on event id **and** payment object, handle completed/expired/failed/refund events, never trust the browser redirect, only the signed webhook can mark paid. Collected revenue = verified gross minus confirmed refunds (wire into `dashboard_overview` and the "Collected this month" card, which currently shows a placeholder `$0`).
3. **Google Calendar (I3, S14)**: per-employee OAuth with PKCE and single-use state bound to user + workspace, refresh token encrypted server-side, FreeBusy check before and immediately before insert, create/reschedule/cancel events, UTC + IANA timezone storage, reconnect state on `invalid_grant`.
4. **Integrations center (I5, S17)**: per-workspace status, last success/last error, event log, retry for recoverable failures, plain-language limits per provider.
5. Every provider needs: signed-webhook negative tests (forged, altered, duplicate), a real sandbox event as evidence, and no secrets in logs or the browser.

### Everyone — release gates (docs/19, docs/15, docs/20)
Requirements traceability matrix with real evidence per ID (`docs/22`), judge demo runbook rehearsal (`docs/20`), delete the dev test users/workspace, reset demo timers to defaults, turn email confirmation back on.

## 12. Definition of done reminders (from the owner's rules)

- Never claim an integration works from fixtures. Evidence is a real sandbox event.
- A change is done when lint, typecheck, unit tests, build and the relevant SQL/RLS tests pass **and** the behaviour was exercised in a browser where it has UI.
- Do not weaken tenant isolation, add a privileged RPC in `public`, add an in-memory timer for business logic, or let a provider call run inside a DB transaction.
- When you change schema or contracts, say so in the PR description and get the platform owner's review.

## 13. First hour checklist for the new developer's Claude Code

1. Read `CLAUDE.md`, this file, `docs/00_START_HERE.md`, then the spec for your lane.
2. `git pull`, `npm ci`, create `.env.local` (ask the owner for the missing values), `claude mcp list` to confirm the Supabase MCP, `npm run dev`.
3. Sign in with a dev account, click through Overview, Leads, Recovery, Pipeline, Customers, Assignment rules, Audit to see what is real versus sample.
4. Pick one item from section 11 for your lane, branch `feat/<name>`, write the migration/tests first when it touches the database, and open a small PR.
5. Agree with the other developer which migration number you will use next (migrations are numbered; collisions break the apply order).

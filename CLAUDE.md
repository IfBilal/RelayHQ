# RelayHQ

Multi-tenant lead-protection CRM for 5–30 person service companies. Every inbound lead has exactly one accountable owner and escalates automatically if ignored. Next.js App Router + Supabase (Postgres, Auth, RLS, Realtime, Cron). Name is provisional.

Source of truth: `problem statement.md` (requirement IDs F/I/Q are cited throughout the docs). Specs live in `docs/` — read the relevant one before implementing, don't guess. Start at `docs/00_START_HERE.md`.

## Where to look
| Need | Read |
|---|---|
| Session plan, branch per task | `docs/16_END_TO_END_IMPLEMENTATION_PLAN.md` |
| Table/column design, SQL functions | `docs/07_DATA_MODEL.md`, `docs/25_SUPABASE_SQL_AND_TRANSACTIONS.md` |
| RLS, grants, auth | `docs/24_SUPABASE_RLS_AND_AUTH.md`, `docs/09_SECURITY_THREAT_MODEL.md` |
| API shapes, error envelope | `docs/08_API_CONTRACTS.md` |
| Assignment/escalation engine | `docs/10_LEAD_ASSIGNMENT_ENGINE.md` |
| Twilio / Stripe / Google / Resend | `docs/12_EXTERNAL_INTEGRATIONS.md` |
| Metric definitions | `docs/13_DASHBOARD_AND_METRICS.md` (and Section 7 of the problem statement) |
| UI tokens and screens | `docs/03_DESIGN_SYSTEM.md`, `docs/04_SCREEN_SPECS.md`, `assets/tokens.css`, `mockups/index.html`, `screenshots/` |
| Requirement → evidence | `docs/22_REQUIREMENTS_TRACEABILITY.md` |

`mockups/` and `screenshots/` are visual references with fake data. Rebuild them in React + Tailwind + shadcn/ui; never copy the static JS or treat them as working features.

## Commands
```bash
npm run dev          # Next.js dev server
npm run build        # production build
npm run lint
npm run typecheck    # tsc --noEmit
npm test             # Vitest
npx supabase start   # local stack (needs Docker)
npx supabase db reset   # LOCAL ONLY. Never against a shared/remote project
```
Env: copy `.env.example` to `.env.local`. Secrets never go in git or in `NEXT_PUBLIC_*`.

## Layout
`src/app` (routes: `(auth)`, `(app)`, `api/v1`, `api/webhooks`, `api/jobs`), `src/features/<domain>/{server,schemas.ts,types.ts,components}`, `src/lib/supabase/{client,server,admin}.ts`, `src/contracts` (shared DTOs, errors, permission strings), `supabase/{migrations,seed.sql,tests}`.

Keep business rules, data access, provider integrations and presentation in separate modules (Q14). A provider or rule must be replaceable without touching the rest.

## Non-negotiable rules
- **Tenant isolation:** every tenant table has `workspace_id`, RLS enabled, explicit GRANTs, and composite `(workspace_id, id)` FKs. Derive workspace/actor from verified Supabase identity (`getUser`), never from request body, URL, JWT role claim or webhook payload.
- **Two Supabase clients:** user-scoped `@supabase/ssr` client by default (RLS applies). The service-role client (`admin.ts`) is server-only, used solely for signed webhooks, cron and onboarding, and every query is explicitly workspace-scoped. No generic admin passthrough.
- **Server enforces permissions** on every route/action (401/403/404/409/422/429, envelope in `docs/08`). Hiding a button is not enforcement.
- **Opportunity value** (`value_minor`) is never returned by `select('*')` to a user without the permission — lists, details, exports and aggregates included.
- **No in-memory timers.** Escalation runs from persisted `deadline_at` via pg_cron SQL functions using `FOR UPDATE SKIP LOCKED` and version checks. No `setInterval`/`setTimeout` for business logic. UI countdowns only project `deadline_at`.
- **One owner per lead.** `owner_user_id` is NOT NULL; no eligible employee falls back to the Owner and flags recovery.
- **Webhooks:** read the raw body, verify the provider signature (Stripe raw body; Twilio over the exact public URL) before any write, dedupe on a unique provider event key, resolve the tenant from the opaque endpoint ID. Only a signed webhook may set a payment to paid or record a refund. Rejected requests are logged with a payload hash only.
- **Outbound provider calls** never happen inside a DB transaction; use the transactional outbox with bounded retries and visible failures.
- **Audit log is append-only:** no UPDATE/DELETE grants or endpoints.
- **SECURITY DEFINER** functions live in the non-exposed `private` schema with `SET search_path = ''`. No privileged RPC in `public`.
- **Secrets:** provider credentials and OAuth refresh tokens are encrypted server-side, never sent to the browser, never shown in full, never logged. No card data is stored or logged.
- **Validate all input with Zod on the server**; filter/saved-list ASTs use an allow-list of fields and operators, never interpolated SQL.
- Configurable timers must be settable in seconds so they can be demoed.
- Never claim an integration works from fixtures. Evidence is a real sandbox event.

## Conventions
- TypeScript strict. Shared DTOs/errors/permission strings come from `src/contracts`; don't redefine shapes per feature.
- Migrations are numbered, reviewed, and tested on a fresh local Supabase. Every DB PR carries RLS tests (anon, tenant A, tenant B, with/without permission).
- UI: Tailwind + shadcn/ui + Lucide with the tokens in `assets/tokens.css`. Every screen needs loading, empty, error, 403 and conflict states, keyboard access, and no horizontal page scroll at 390px. Status never relies on colour alone.
- Money is stored as integer minor units plus currency.
- Timestamps stored as `timestamptz` (UTC); render in the viewer's/employee's zone.
- Branch per task (`feat/...`), small PRs, dependencies-first merge order (contracts → migrations/RLS → services → UI → provider tests). Ownership boundaries are in `docs/18_PARALLEL_WORK_AND_GIT.md`; schema and `src/contracts` changes need the platform owner's review.

# Technical Implementation Stack — Locked to Next.js + Supabase

## Technology selection
| Layer | Selection | Principle |
|---|---|---|
| React + server | **Next.js App Router + TypeScript** | One full-stack project, server components + Route Handlers |
| Hosting | **Vercel** | HTTPS deployed Next.js and webhook endpoints |
| Database | **Supabase PostgreSQL** | SQL schema, FK, JSONB custom fields, locks, RLS, indexes |
| Authentication | **Supabase Auth with `@supabase/ssr`** | Secure server-available cookie sessions, PKCE where needed |
| Live events | **Supabase Realtime** | Permission-aware channels, requery on event |
| Scheduling | **Supabase Cron (`pg_cron`)** | DB source of truth for SLA expiry, outbox dispatch trigger |
| UI | **Tailwind CSS + shadcn/ui + Lucide** | Theme tokens applied consistently; component accessibility |
| Forms | **React Hook Form + Zod** | Shared server/client validation contracts |
| Data visualization | **Recharts** | Only essential chart; role-aware metrics |
| Tests | **Vitest, Playwright, Supabase CLI/pgtap** | Unit, E2E, RLS, scheduled-engine race, provider webhook tests |
| External | Twilio, Stripe, Google Calendar, Resend | Real sandbox/test accounts |

## Single-app repository tree
```text
relayhq/
  src/
    app/
      (auth)/{login,signup,invite}/page.tsx
      (app)/{dashboard,recovery,leads,pipeline,contacts,inbox,calendar,integrations,settings,audit}/page.tsx
      api/{leads,contacts,opportunities,integrations,dashboard,...}/route.ts
      api/webhooks/{twilio/[endpointId],stripe/[endpointId]}/route.ts
      api/jobs/dispatch-outbox/route.ts
      auth/callback/route.ts
      globals.css
    components/{app-shell,ui,shared}
    features/{identity,workspaces,permissions,crm,leads,messaging,payments,calendar,notifications,audit,reporting}/
    lib/supabase/{client,server,admin}.ts
    contracts/{dto,errors,permissions,events}.ts
  supabase/{config.toml,migrations,seed.sql,tests}
  tests/{unit,integration,e2e,security,fixtures}
  docs/                     # engineering docs from package
  public/
  .github/workflows/ci.yml
  .env.example
  package.json
```

## Recommended bootstrap (commands are to run in your repository; not already executed)
```bash
npx create-next-app@latest relayhq --typescript --tailwind --eslint --app --src-dir
cd relayhq
npm install @supabase/supabase-js @supabase/ssr zod react-hook-form @hookform/resolvers lucide-react recharts @tanstack/react-query stripe twilio googleapis resend
npm install -D supabase vitest @playwright/test typescript
npx supabase init
npx supabase start                  # needs Docker, or use separate team dev Supabase project
npx supabase migration new foundation
npx supabase db reset               # local only; destructive to local database
npm run dev
```
Run relevant shadcn setup through its **current official CLI** at kickoff; pin lockfile versions. Confirm latest Next.js and Supabase CLI requirements on each laptop before copying scripts.

## Environment key contract
`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, server-only `SUPABASE_SERVICE_ROLE_KEY` (actual key name depends on project), `APP_URL`, `INTEGRATION_ENCRYPTION_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_WHATSAPP_FROM`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`, `RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `CRON_DISPATCH_SECRET`.

**Per-workspace provider secrets:** store encrypted credentials server-side and select by verified endpoint integration; environment keys may be **single-workspace demo bootstrap only**. Do not claim to support per-workspace credential configuration if everything uses one global Twilio/Stripe account.

## Contract conventions
Route Handlers use Next.js `Request`/`Response` interfaces: `request.text()` for raw Stripe JSON; Twilio URL-encoded body must preserve exact trusted callback URL for signature verification. Inbound paths under `/api/webhooks/...`; user-facing APIs under `/api/v1/...` (or direct Server Actions with identical Zod contracts). Use one consistent prefix for all features.

```
GET    /api/v1/me
GET    /api/v1/leads?recovery=true
POST   /api/v1/leads
POST   /api/v1/leads/:id/acknowledge
GET    /api/v1/contacts/:id
POST   /api/v1/opportunities/:id/checkout
GET    /api/v1/dashboard/overview
POST   /api/webhooks/stripe/:endpointId
POST   /api/webhooks/twilio/:endpointId
GET    /api/auth/google/callback
```

Error: `{ "error": {"code":"...","message":"...","requestId":"...","details":{}}}`. `401` unauthenticated, `403` permission, `404` tenant ID inaccessible, `409` version conflict, `422` validation, `429` throttling. Typed DTOs under `src/contracts`; never duplicate DTO shapes across developers.

## Supabase Auth and tenant setup
`auth.users` is managed by Supabase. Application profiles are in `public.profiles` linked to Auth UUID. Workspace signup inserts workspace + owner membership + default pipeline/rules through an authenticated, fixed-function transaction with `auth.uid()`; do not store application password hashes. Invite is through Supabase Auth invitation (or verified token flow) and approved membership transaction. Cookie refresh follows documented Next.js SSR pattern, server must verify identity with Auth rather than blindly trust unverified cookie contents.

## Database + permission design
Migrations and policy tests are part of every DB PR; `supabase db diff` is not a substitute for review. High-risk mutations call narrowly scoped SQL `private` functions through a trusted server-only layer or carefully granted RPC functions. **No arbitrary service-role endpoints.** RLS applies even when UI hides data; financial `value_minor` must never be selected from unguarded direct Data API tables by a prohibited role: use read-safe table designs or revoked column grants and permission-gated projection.

## Dependencies and import discipline
Team A owns `supabase/migrations`, `src/lib/supabase`, `src/features/leads/server`; Team B owns design tokens + `src/components` and app pages; Team C owns `src/features/{crm,integrations,...}`. Cross-owner modification requires contract PR. Branch per task and lockfile updates from designated owner only.

## Official docs
- https://supabase.com/docs/guides/auth/quickstarts/nextjs
- https://supabase.com/docs/guides/auth/server-side
- https://supabase.com/docs/guides/database/postgres/row-level-security
- https://supabase.com/docs/guides/cron
- https://nextjs.org/docs/app/api-reference/file-conventions/route

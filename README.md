# RelayHQ

Multi-tenant lead-protection CRM for 5–30 person service companies: every inbound lead has exactly one accountable owner and escalates automatically if ignored. Next.js (App Router) + Supabase (Postgres, Auth, RLS, pg_cron) + Stripe test mode, Google Calendar, SMTP email (Nodemailer).

Specs live in `docs/` (start at `docs/00_START_HERE.md`); current state and gotchas in `docs/HANDOFF.md` and `docs/PROGRESS.md`; security measures in `docs/SECURITY_MEASURES.md`.

## Cold start (Q13)
Prerequisites: Node 20+, a Supabase project (or Docker for `npx supabase start`).

```bash
git clone <repo> && cd <repo>
npm ci
cp .env.example .env.local        # fill in values; see the comments in the file ([S] = secret)
```

**Database**
- Local stack (needs Docker): `npx supabase start`, then `npx supabase db reset` (applies `supabase/migrations/*` in order, then `supabase/seed.sql`: two tenants, 500 contacts each, opportunities, leads). **Local only — never run `db reset` against a shared/remote project.**
- Hosted project: apply `supabase/migrations/*.sql` in numeric order (SQL editor, MCP or `supabase db push`). Seed data is local-only; create your first workspace through `/signup`.
- Seed users have no passwords (nothing sensitive in git). Set one in the Auth dashboard, or sign up a fresh user.

**Run**
```bash
npm run dev          # http://localhost:3000
npm run lint && npm run typecheck && npm test && npm run build
```

**Tests**
- Unit: `npm test` (Vitest).
- SQL/RLS: `supabase/tests/*.test.sql` (pgtap) via `npx supabase test db` locally.

## Deploying (Vercel)
1. Import the repo; set the env vars from `.env.example` (`NEXT_PUBLIC_*` must exist at **build** time).
2. Set `APP_URL` to the final `https://` URL. The dispatch route refuses to run in production without it.
3. Supabase Auth → URL configuration: add the site URL and redirect URLs; turn "Confirm email" back on for the demo.
4. Escalation emails: schedule a pg_cron + pg_net job that `POST`s `/api/jobs/dispatch-outbox` with `Authorization: Bearer $CRON_DISPATCH_SECRET`.
5. Webhooks/OAuth callbacks use `APP_URL` as their public base.

## Secrets
Provider credentials live only in server env (never `NEXT_PUBLIC_*`, never committed, never logged). Provider tokens stored in the DB are encrypted with `INTEGRATION_ENCRYPTION_KEY`.

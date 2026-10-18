# Deploy, Operate and Recover — Vercel + Supabase Cloud

## Environments
- **Local:** Next.js `npm run dev`, Supabase CLI local stack / Docker if available, Twilio/Stripe CLI or HTTPS tunnel for development callback tests.
- **Staging:** shared Supabase dev project + Vercel preview HTTPS, separate webhook secrets, seed fixture workspace, invited test users. Never reset remote shared DB.
- **Demo:** Vercel stable URL + dedicated Supabase cloud project, production-like env variables, real **test/sandbox** provider credentials, Cron enabled, test accounts only.

## Deploy order (cannot invert)
1. Freeze contracts and review SQL migrations with A. Apply staged migrations, SQL RLS tests, unique indexes + protected functions before web deploy.
2. Configure Supabase Auth site URL, verified redirect list, OAuth providers if any, Realtime publication, Cron schedule with visible status.
3. Set Vercel env: publishable Supabase URL/key public; service role, provider tokens, encryption key, dispatcher secret **server-only**.
4. Deploy Next.js app; check `GET /login`, `/dashboard` unauth redirects, health endpoint, no runtime error.
5. Configure Twilio WhatsApp sandbox `POST https://<domain>/api/webhooks/twilio/<endpointId>`, status callback; Stripe webhook endpoint `POST .../stripe/<endpointId>` and matching signing secret; Google registered redirect URI exact HTTPS; SMTP email (Nodemailer) sender configuration.
6. Create a test workspace and users with distinct permissions, seed contacts/opportunities/stages/rules, set 15–30-second demo acknowledgement windows, capture screenshot baseline.
7. Validate **actual** provider events; check sync history/retries and dashboard updates; last Cron run and outbox job count.
8. Run remote E2E tests then lock tag and retain rollback build/previous migration notes.

## Startup & ops proof
Document commands in project README: `npm ci`, `npx supabase start`, `npx supabase db reset` (**local only**), `npm run dev`, `npm run test`, `npm run test:e2e`, `npx supabase test db`. Have one env validation script fail with helpful names, never values. CI must catch leaked service keys and migration drift.

## Runtime assumptions
Next.js is serverless on Vercel; no always-on worker or `setInterval`. Supabase Cron executes transition SQL and invokes protected job dispatch using fixed secret and verified host. Watch function timeouts, retry bounded batches, 429 provider quotas. If hosted plan limits Cron interval or concurrent runs, measure and adjust with smaller due windows; never promise unverified exact timing.

## Operational dashboards
Monitor public app errors, Supabase DB connection pool / query latency, Cron run duration and last success, overdue unacknowledged leads, outbox retry age, Twilio signed webhook rejections and delivery, Stripe replay count, Google token refresh failure. Sanitized logs only; audit entries may contain PII and are permission-restricted.

## Backup / demo fallback
- Export sanitized demo tenant seed script **before** final run; no production real-customer data in fixtures.
- Keep an Owner+Admin+User seeded login; pre-join Twilio test phone and verify Google calendar consent earlier.
- If external provider outage mid-demo, show recorded **real previous** verified sync history and disclose it; never substitute a simulated success as current real delivery.
- Rollback Next.js release via Vercel deployment; forward-only DB migrations require explicit reviewed recovery plan.

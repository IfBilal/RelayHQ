# Security measures (what each one defends)

| Measure | Where | Defends against |
|---|---|---|
| Row-level security on every tenant table, composite `(workspace_id, id)` FKs | `supabase/migrations/*`, tests in `supabase/tests/*` | One workspace reading or writing another's data (cross-tenant access, IDOR) |
| Workspace and actor derived from `auth.getUser()`, never from body/URL/JWT claim | `src/features/identity/server/session.ts`, `src/lib/api.ts` | Tenant/identity spoofing by editing a request |
| Writes only through `SECURITY DEFINER` functions in the non-exposed `private` schema, `search_path=''`, permission checked inside | migrations | Privilege escalation, search-path hijack, calling privileged RPC from the browser |
| Opportunity money lives in `private.opportunity_financials`, readable only via permission-gated functions; audit log records `{"changed": true}` only | migrations 2 and 6 | Value leak to users without `opportunity.value.view` (F1.4), including through the audit log |
| Append-only audit log (trigger blocks UPDATE/DELETE/TRUNCATE, no grants) | migration 1 | Tampering with history (F4.3) |
| Persisted deadlines + `pg_cron` + `FOR UPDATE SKIP LOCKED` + version checks | migration 3 | Lost/duplicated escalations, races between acknowledge and expiry |
| Zod validation on every server input | route handlers | Malformed or hostile payloads, mass assignment |
| Security headers (`next.config.ts`): CSP (`frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action` limited to self + Stripe Checkout + Google sign-in (Chrome applies it to redirects after form posts), `connect-src` limited to self + Supabase), `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, HSTS, `Permissions-Policy` | `next.config.ts` | Clickjacking, MIME sniffing, referrer leakage, protocol downgrade, injected exfiltration endpoints, unwanted device APIs. Known limit: `script-src` keeps `'unsafe-inline'` because of Next's inline bootstrap (nonces would be the upgrade) |
| Cross-site write check on `/api/v1/*` (`Sec-Fetch-Site`, falling back to `Origin` vs `Host`) | `src/proxy.ts`, `src/lib/origin.ts`, `tests/unit/origin.test.ts` | CSRF against cookie-authenticated APIs. Exempt by design: signed webhooks (`/api/webhooks`, excluded from the proxy), cron route `/api/jobs` (outside `/api/v1`, bearer secret), anonymous public lead form (`/api/v1/public`, rate-limited in the DB) |
| Cron route protected by a bearer secret compared in constant time | `src/app/api/jobs/dispatch-outbox/route.ts` | Unauthenticated triggering of the outbox, timing attacks on the secret |
| Public lead form rate limit in SQL (`private.hit_rate_limit`) | migration 3 | Spam and flooding of the anonymous endpoint |
| Login throttling | Supabase Auth (429 mapped to `rate_limited`) | Password guessing. No second app-level limiter: it would be in-memory on serverless and ineffective |
| Secrets only in server env, never `NEXT_PUBLIC_*`, never logged | `.env.example`, `CLAUDE.md` | Credential disclosure |

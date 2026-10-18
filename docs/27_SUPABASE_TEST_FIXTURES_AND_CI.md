# Supabase/Next.js Test Fixtures, CI and Demo Dataset

## Fixture design
Generate two completely separate workspaces: `Atlas Solar` (main) and `Beacon Realty` (tenant B isolation probe). In A: Owner, Admin, permission-configurable Manager, two Available sales reps, one Busy and one On leave. Add 500 contacts, 30 leads, 12 opportunities (two pipelines with distinct field definitions), pending/paid/refunded test payment records, three Google-linked appointments, signed-message test evidence, audit and outbox rows. **Never seed fabricated provider-confirmed statuses in production demo as though real.** Fixtures for local tests are labeled `test_fixture`; live demo provider events must be genuinely triggered.

## Unit, DB and integration tests by subsystem
| Scope | Tool | Must verify |
|---|---|---|
| Zod forms + filter parser | Vitest | invalid types, unknown operator, 3 criteria filter |
| RLS and SQL functions | Supabase CLI `supabase test db` / pgtap | cross-tenant, owner/admin/user, money mask, schema privilege, replay |
| Lead concurrency | two isolated database clients with transaction tests | ack/expiry and expiry/expiry races, null owner impossibility |
| Next.js endpoints | Vitest/request helper | auth, scopes, status codes, webhooks signature rejection |
| Real integrations | Sandbox accounts + sanitized event IDs | Twilio phone roundtrip, Stripe test checkout/refund, Google event, Resend email |
| UI flows | Playwright | 390/768/1440, login, recovery, board, inbox, export masking, error states |
| A11y | Playwright + axe-core | keyboard focus, labels, status text, responsive no overflow |
| Performance | paginated 500-record fixtures | query indexed and user interaction responsive |
| Deployment smoke | HTTPS deployed domain | OAuth redirects, signed callbacks, Cron, Realtime, refresh persistence |

## CI on each PR
```text
checkout → npm ci → lint → typecheck → unit tests → Supabase local DB start → migrate → SQL/RLS tests → Playwright (if runner provisioned) → secrets scan
```
Require main branch checks and reviewed migrations; no uncontrolled `supabase db reset` on hosted DB. Keep provider E2E test logs in protected artifact store, with personally identifying information stripped.

## Demo sequence test
1. Owner account sees dashboard/recovery; new web form produces one lead, one owner.
2. Set rep Busy: exclude from round robin; set next rep On leave: unacknowledged lead immediately reassigns.
3. Let configured deadline expire, Supabase Cron transitions and Resend alert arrives; log and audit align.
4. Real Twilio WhatsApp inbound from joined phone creates/contact matches lead; reply delivered and status callback shown.
5. Stripe test checkout → signed webhook confirms amount; refund → collected reduced, projected unchanged per definitions.
6. Google OAuth employee connects, books available slot, conflicting slot warns, cancel/reschedule reflected in Google.
7. A User without money view cannot access amounts via list, detail, direct `/api/v1`, export or direct Supabase query; tenant B cannot access A record by ID.
8. Open sync history, audit, Realtime update and show failure retry (controlled rejected provider call), without tampering data.

## Evidence ledger
Each acceptance F/I/Q should point to one automated test name, one observed human demo action, and one sanitized screenshot/log reference in the requirement matrix. Mark `NOT TESTED`, `MOCK ONLY`, `REAL TEST`, `PASS`, `FAIL` explicitly. Screenshots alone cannot establish server-side security.

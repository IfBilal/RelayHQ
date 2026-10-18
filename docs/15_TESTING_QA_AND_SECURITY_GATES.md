# Full Test Plan — Functional, UX, Concurrency, Security and Integration

## Testing pyramid
`Vitest` unit/domain (lead evaluator, permission matrix, custom field validation, metrics) → `Vitest request handler harness` API/integration (actual Postgres test DB + Supabase Cron for durable tests) → Playwright E2E multi-user / mobile viewport / provider test environments. Contract tests run even when real external sandbox unavailable; **contract mocks do not count as the real provider demo**.

## CI commands/gates (implement these scripts)
```bash
npm lint
npm typecheck
npm test:unit
npm test:integration
npm test:e2e
npm test:security
npm build
```
Lint/typecheck/build and selected unit/integration tests run for every PR. E2E smoke on main and before demo. CI uses test secrets and ephemeral DB; never real production/provider secret variables in public workflow logs.

## Mandatory test scenarios and IDs
| Test | User flow | Assertion |
|---|---|---|
| T-IDENT-01 | Owner signs up / reloads / logs out | owner membership + persisted then revoked session |
| T-AUTHZ-01 | User PATCH assignment rules | 403 + unchanged DB |
| T-AUTHZ-02 | Workspace B GET/EDIT A's records | 404 and no mutation |
| T-AUTHZ-03 | Value-hidden actor calls list, detail, CSV | no financial value fields |
| T-CRM-01 | create 2 pipelines fields differ | both reflect instantly; contact common |
| T-CRM-02 | move to required stage without fields | 422 clear fields; no move |
| T-CRM-03 | delete populated stage | 409 or transactional migration; no orphan |
| T-CRM-04 | save 3-filter list and change record | dynamic membership updated |
| T-LEAD-01 | 3 sources capture | correct labels, exactly one owner |
| T-LEAD-02 | busy/on leave/cap | never normal-assign unavailable/overcap |
| T-LEAD-03 | 2 workers expire same lead | 1 reassignment, 1 audit, 1 notification intent |
| T-LEAD-04 | ack races expiry | single winner, first ack immutable |
| T-LEAD-05 | worker restart | DB sweeper catches due lead |
| T-LEAD-06 | no eligible rep | Owner emergency flag, not null |
| T-TWILIO-01 | real inbound sandbox msg | one lead/contact/conversation |
| T-TWILIO-02 | invalid signature/duplicate SID | rejection; no duplicate |
| T-TWILIO-03 | reply + delivery callback + opt-out | real send and server-side block |
| T-STRIPE-01 | real hosted checkout + webhook | paid and collected only after signed event |
| T-STRIPE-02 | duplicate/forged/failed/refund | counted once, forge rejected, net correct |
| T-GOOGLE-01 | OAuth + real create/reschedule/cancel | event exists and local timeline sync |
| T-GOOGLE-02 | overlap/revoked token/timezone | conflict/reconnect correct |
| T-EMAIL-01 | lead escalates | real mail delivered/test evidence within 60s under healthy provider |
| T-EMAIL-02 | provider unavailable | lead commits; retry + visible error |
| T-REPORT-01 | seeded known events | dashboard matches underlying results |
| T-UX-01 | mobile 390/ tablet 768/ desktop 1440 | no global overflow, all actions usable |
| T-UX-02 | keyboard-only forms/board | labels/focus/semantic controls |
| T-Supabase Realtime-01 | new lead + reconnect | UI re-fetches no manual refresh |

## Specialized attack/race harness
Use Promise.all with 30 intakes and 10 expirations in integration tests against real Supabase Postgres with 2+ concurrent Cron SQL calls; assert caps and count invariants. Webhooks should be tested with altered raw payload/signature and signed duplicates. Test IDOR matrix on Contacts, Opportunities, Files/exports (if any), Leads, Conversations, Payments, Appointments, Rules, Integrations, Audit and Supabase Realtime.

## Cross-browser and accessibility
Playwright Chromium + at least one alternate engine if time allows; axe automated checks plus manual keyboard: tab order, focus visibility after dialog closing, Escape, labeled inputs, contrast, 200% zoom; role-based hidden money and status meaning without color. Skeleton/empty/error/offline states screenshot test.

## Release stop conditions
- Any unauthenticated or cross-workspace PII/payment access.
- Fake provider confirmations presented as real or invalid webhook accepted.
- Duplicate lead owners, stale timer overwrites acknowledgement, untracked external send failure.
- App unable to start from documented commands/deployed callbacks unreachable.
- One critical lead action inaccessible on mobile.

## Evidence to save
Screen recording of end-to-end flow, API tests passing, webhook event IDs (redacted), Google real event in calendar, phone receiving WhatsApp, inbox email, multi-workspace negative security tests, worker restart log. Show only demo-safe accounts and scrub PII.

## Supabase-specific safety gate
Run `supabase test db` and check direct Data API reads/writes across workspaces; test RLS grants *and* policy, unauthorized money column access, service-role isolation, Cron expiry two-concurrent-run tests, and a logged-in Supabase Auth SSR cookie refresh. See `24_SUPABASE_RLS_AND_AUTH.md` and `27_SUPABASE_TEST_FIXTURES_AND_CI.md`.

# SQL Transactions, Cron, Idempotency and DB Security

## Database functions and permissions
A single DB transaction must group writes that cannot be partially applied. Use `private` schema for non-exposed SQL helpers and engine functions. Prefer migrations that **revoke public execute** and grant only narrow invoking identities. A Next.js server pathway may use a restricted direct database connection or a reviewed wrapper for a fixed operation; service role is allowed only under server-only verified handler and **explicit tenant predicates**. Do not make a `public.run_arbitrary_sql` RPC or expose a SECURITY DEFINER function with unchecked workspace ID.

## Transaction: create lead
1. Validate authenticated actor or authenticated source integration/public form authorization, normalize contact fields and resolve **verified** workspace.
2. Lock `assignment_rules` row (`FOR UPDATE`) to serialize routing cursor and ensure capacity assignments agree.
3. Query eligible staff by `Available`, enabled membership and `open_lead_count < max`; choose next RR; else emergency Owner.
4. Create/reuse contact and lead with non-null `owner_user_id`, store DB `clock_timestamp()`-derived `first_assigned_at`, `assigned_at`, due time and version=1.
5. Create `lead_assignment_events`, `audit_events` and `outbox_events` with a deterministic key in same transaction.
6. Commit; only then send/dispatch outside provider actions. On unique source key conflict return existing lead; do not reassign duplicates.

## Transaction: acknowledge
Lock target row by lead ID, verify active user's permission/current assignment, detect expectedVersion. If `first_acknowledged_at` null set to DB clock and append activity+audit. Else return idempotent already-acknowledged. Acknowledge that arrives after expiration already committed must not restore former owner; return 409 and refresh.

## Transaction: expiry batch
```sql
-- Illustrative shape, NOT ready-to-deploy SQL. An implementation function must
-- check eligibility, lock the routing rule and insert audit/outbox atomically.
select id
from public.leads
where deadline_at <= now()
  and first_acknowledged_at is null
  and status = 'open'
order by deadline_at
for update skip locked
limit 50;
```
For each selected lead, check status and the exact assignment version under lock, choose next allowed escalation user, increment version and level, write one assignment event with `(lead_id, previous_version,'timeout')` UNIQUE, audit event and outbox. If a row is no longer eligible, skip with no side effects. Avoid holding locks while calling HTTP providers. If multiple cron invocations overlap, SKIP LOCKED plus unique guard prevents both processing the same committed expiry.

## Supabase Cron
Use managed Supabase Cron to invoke a fixed database function at validated cadence and record outcome in `job_runs`. Schedule `outbox` dispatcher independently after the transaction step. Supabase Cron can run SQL functions or request external HTTPS endpoints. Exact schedule and permission depend on project capabilities; validate `cron.job_run_details` and any plan limitations before demo. Don't depend on Vercel functions staying alive.

## Webhook event insert-before-apply
With provider signature verified **first**, resolve endpoint integration and tenant, insert `integration_events` with unique `(integration_id, provider_event_id)`, then perform permitted entity transition and audit/outbox in same transaction. Duplicate event should acknowledge without duplicate business effects. Ordering guard checks provider timestamp/state precedence: payment confirmed only through verified Stripe event, refunds accumulate exactly once. `checkout.session.completed` and `payment_intent.succeeded` may describe the same underlying transaction: dedupe at payment object too, not only event ID.

## External outbox dispatch
Schema: `id, workspace_id, kind, payload_ref, idempotency_key UNIQUE, status, attempts, lease_until, next_attempt_at, provider_reference, last_error, created_at`. A claim transaction moves due rows to leased; after commit, the server sends network requests, persists outcome or schedules exponential retry. A crash after external send but before recording success creates the possibility of repeat attempt: use provider idempotency where available and label at-least-once semantics honestly.

## Testing
- Two `pg` sessions/processes concurrently execute expiry; exactly one successful transition and one audit.
- Retry same webhook with same event ID; no duplicate lead/message/payment.
- During Next.js server restart, deadline remains due in database, processed on next Cron run.
- Owner emergency applies when no available rep; same-workspace FK holds.
- Malicious client attempts to call elevated functions or direct table mutation; privilege denied.
- Payout/refund amount constraints prevent negative collected revenue or underflow from duplicate refund webhook.

Official Cron: https://supabase.com/docs/guides/cron

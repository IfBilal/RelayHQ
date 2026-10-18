# Durable Background Processing, Supabase Realtime and Observability

## Why not in-memory tasks?
Next.js deployments may pause/restart processes. `setTimeout`, `setInterval`, browser tab timers and a per-instance queue cannot guarantee lead escalation. **Only committed Supabase PostgreSQL deadlines are authoritative.** Supabase Cron invokes DB functions on persisted schedule; monitor `cron.job_run_details` and your own `job_runs`/`outbox_events`.

## Two workflows
1. **In-DB deadline transitions:** `private.escalate_due_leads(batch_limit)` scheduled by Supabase Cron; transactional locks, deterministic versioning, audit and outbox.
2. **Outside-DB provider calls:** protected `POST /api/jobs/dispatch-outbox` from Cron or an Edge Function. Verify `CRON_DISPATCH_SECRET` and allowlist; claim outbox row with DB lock / lease in one atomic operation; send via Resend; record success or next retry. Limit batches to deployment runtime and provider throughput. Do not expose a general job runner to the browser.

## Scheduled execution cadence
For judge demo, configure acknowledgement per level in seconds and a Cron cadence appropriate to the deployment. **Prove the observed end-to-end deadline-to-email time**, including scheduler overhead, instead of promising a fixed sub-second SLA. The source asks for external notification within one minute: test it. Inability to achieve this is a blocker, not an acceptable fake timer workaround.

## Idempotency & crash windows
- Expiration: unique `(lead_id, previous_version, 'timeout')`; row lock prevents two committed owners.
- Outbox: lease + `next_attempt_at` + `attempts` + fixed idempotency key. Exactly-once *external email delivery* cannot always be guaranteed across provider timeouts. Persist provider message ID and dedupe when supported; show retry state.
- Inbound: unique provider event IDs and payment transition guards. Event can arrive out of order; never demote paid transaction because earlier pending arrives later.

## Realtime design
Use Supabase Realtime for relevant tenant-scoped changes (leads, inbox, messages, payments, appointments). Enable Realtime publications selectively and RLS policy/channel authorization. Limit payload to low-sensitivity change IDs; fetch authoritative row after event. Reconnect invalidates queries; `useRealtimeLeadFeed` unsubscribes on workspace change. If realtime disconnected, show subtle degraded state and poll critical lists periodically.

## Operational logs and trace IDs
`request_id` links Next.js route, audit, outbox and integration event. Keep event types, duration, outcome, sanitized provider error and correlation IDs, but no secrets/card data/message private payloads in logs. Integration control panel shows provider state, last success, last attempt, error and retry count. Admin audit filter: actor, type, date, target.

## Minimum release observability
Dashboard for outstanding outbox count, failed attempts, overdue unacknowledged leads, last Cron run status, messaging callback delays, Stripe webhook delays, OAuth reconnect status. Alerts in demo prep if last Cron run unexpectedly old. Provide manual **admin-only, audited and idempotent** test trigger for recovery, not an unauthenticated debug route.

## Official source
https://supabase.com/docs/guides/cron

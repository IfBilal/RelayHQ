# PROGRESS

Open blockers: none for item 1. `E2E_PASSWORD` was not set in the shell; it is needed for the browser checks in later slices (UI work), so export it before those.

## 1. Audit-log value leak (SECURITY) — branch `feat/audit-value-masking`

**Problem:** `private.set_opportunity_value` wrote `value_minor` (old and new) in clear into `audit_events`; any `audit.view` holder could read money, bypassing F1.4.

**Changed**
- `supabase/migrations/20261018000006_audit_value_masking.sql`: function now logs `{"changed": true}` only. One-off scrub of existing `opportunity.value_changed` rows, with `audit_events_no_update` disabled and re-enabled in the same transaction; the migration asserts no `value_minor` remains and the trigger is enabled (`tgenabled = 'O'`), else it aborts.
- `supabase/tests/audit_masking.test.sql`: user with `audit.view` but without `opportunity.value.view` sees no amount in the audit read path and is refused on `opportunity_values`; UPDATE/DELETE still blocked for the user and for the privileged role; trigger enabled.

**Verified**
- Migration applied to the remote project via MCP (exact file contents). `get_advisors(security)`: only the known leaked-password-protection warning.
- SQL test run via MCP rollback method: 12/12 ok.
- Live DB after apply: 0 audit rows containing `value_minor`, trigger enabled. The live DB had no prior `value_changed` rows, so the scrub UPDATE was a no-op there (the migration's own check still ran).

**Decision: `member.invited`** stores the invitee email in clear in `audit_events.after`. Kept: admins need to see who was invited, and the same email is already readable by `team.invite` holders in `invitations`. Residual: an `audit.view` holder without `team.invite` can see invitee emails. Mask later if the owner wants (store the domain only).

**Risks:** the scrub cannot be undone (intended). Older value history is gone; the activity timeline only says "Value changed".

**Next:** item 2, security headers and CSRF/Origin check.

## 1b. Audit leak: merged (PR #7) 
Follow-up from review: added a test that runs the scrub UPDATE on a legacy row (14/14 SQL assertions). Migration 6 rewrites the append-only table once, intentionally; old values may remain in backups/WAL.

## 2. Security headers + CSRF check: merged (PR #8)
CSP + security headers in `next.config.ts`; cross-site mutation check for `/api/v1/*` in `src/proxy.ts`; `docs/SECURITY_MEASURES.md`. Verified on a production server: headers present, cross-site POST 403, same-origin 200, 0 CSP console errors on /login. Reviewed (web-sec-hardener, code-reviewer); doc fixes applied.

## 3. Deploy prep + email: merged (PR #9)
`APP_URL` fails loudly in production; `.env.example` (Twilio/Resend removed); `supabase/seed.sql` (NOT executed anywhere: no Docker, and running it on the shared remote DB was blocked); README cold start. Email switched from Resend to Nodemailer/SMTP (`SMTP_HOST/PORT/USER/PASS/FROM`), STARTTLS required off port 465. **A real email to a real inbox is still unproven**: needs SMTP creds, a public URL and the pg_cron+pg_net schedule.

## 5. Team UI (F1.2/F1.3): branch `feat/team-ui`
`/team` (members, access level + permission role + active toggle, availability, invite form, pending invitations, role/permission matrix), `/invite?token=`, `/settings/profile` (name, time zone, alert email). Routes: `POST /api/v1/team/invitations` (raw token returned once, only sha256 stored), `/invitations/accept`, `PATCH /team/[userId]/access`, `PUT /team/roles/[roleId]`, `PATCH /api/v1/profile`. Login/signup honour a same-origin `next`.
Security fix found in review: `invite_member` let a `team.invite` holder invite into a broader role. Migration `20261018000007_invite_role_ceiling.sql` (applied; 6/6 SQL assertions in `supabase/tests/invite_ceiling.test.sql`) enforces role ⊆ inviter's permissions (Owner exempt).
Limits: invitees still pass through signup (a throwaway workspace is created); the most recently joined workspace is the active one (no switcher). Invitation link is shown to the inviter to copy; it is not emailed yet. Not browser-tested while logged in: `E2E_PASSWORD` was not set.

### 5b. Team PR review fixes (migration `20261018000008_role_ceilings.sql`, applied; 16/16 SQL assertions in `supabase/tests/role_ceilings.test.sql`)
- `set_role_permissions` / `change_member_access`: a non-Owner can only edit or assign roles that are a subset of their own permissions; only the Owner can modify, disable or demote an Admin. `accept_invitation` now needs a verified email.
- `safeNext` extracted to `src/lib/safe-next.ts` with a unit test (`/.//evil.com`, `//`, backslash, control chars, `javascript:`); session ordering has a deterministic tiebreak.
- Not done (reviewer "optional"): revoke/resend for expired invitations (an expired invite blocks re-inviting that email), "already a member" pre-check, verified `notification_email`. Audit other RLS-only reads for multi-workspace users: the invitee-with-two-workspaces case is only reachable after accepting an invite.

## 6a. CRM configuration (F2.2-F2.5): branch `feat/crm-config`
`/settings/pipelines`: pipelines, stages (add/rename/reorder/delete with destination + blocker report), custom fields (per pipeline or global, 5 types), required fields per stage; dynamic fields on the opportunity form. All routes need `pipeline.manage`; SQL re-checks. Review fixes in migration `20261018000010_stage_integrity.sql` (applied; 13/13 SQL assertions in `supabase/tests/stage_integrity.test.sql`): delete-then-add-then-delete slot collision fixed, cannot delete the last open stage or the last Won/Lost, Won/Lost stay last on reorder, `create_opportunity` refuses archived/foreign-pipeline stages, archived opportunities move with the stage. UI: delete confirm, descriptive button labels, accurate counts.
Not done: saved lists (F2.6), pipeline rename/archive, custom values on an opportunity detail view, cross-scope duplicate field-key check (workspace-wide vs pipeline-scoped), stage/field/pipeline caps in SQL. Not browser-tested while logged in (no `E2E_PASSWORD`).

## 7. Messaging removed (PR #13) and Low findings (branch `fix/low-findings`)
- Scope change: all messaging out of scope. `/inbox`, its nav entry, `twilio` dependency and Twilio config/mentions removed; scope banner in `docs/HANDOFF.md` and `docs/00_START_HERE.md`. DB permission keys `conversation.view`/`message.send` and the `whatsapp` lead-source CHECK value left in place (schema change, no benefit).
- Migration `20261018000011_low_findings.sql` (applied; 18/18 SQL assertions in `supabase/tests/low_findings.test.sql`): only the Owner edits the Admin preset or Admin-held roles; an expired pending invite is replaced on re-invite, inviting an existing member is refused (23505), pending invites can be revoked (`revoke_invitation`, Revoke button on `/team`); `profiles.notification_email` is no longer column-writable, it changes through `set_notification_email` (validated, audited with the domain only).
- PR #14 review follow-ups: migration `20261018000012_low_findings_review.sql` (applied): `revoke_invitation` applies the same role ceiling as `invite_member`; private functions have no default PUBLIC/anon execute. Profile route: omitted alert email no longer clears it, and the alert email is written first (validated) so a bad address cannot leave a half-saved profile. Known/optional: audit rows for the alert email go to every workspace of the user (domain only); the 23505 for "already a member" and "pending invite" share a code.

## 8. Stripe Checkout + signed webhook (I2): branch `feat/stripe`
- Migration `20261018000013_stripe_payments.sql` (applied; 30/30 SQL assertions in `supabase/tests/stripe_payments.test.sql`): `payment_requests`, `payment_refunds`, `integration_events` (dedupe key, rejected deliveries), `create_payment_request`/`attach_checkout_session`/`fail_payment_request`/`collected_summary` for users, `apply_stripe_event`/`record_rejected_webhook` for the service role only (authenticated and anon are refused). Paid only through a signed event; amount and currency re-checked against the snapshot (mismatch -> failed, not paid); `charge.refunded` -> partially/fully refunded; failed/expired handled; a repeat event id is a counted duplicate.
- App: `POST /api/v1/payments` (snapshot -> hosted Checkout, idempotent -> store session; Stripe failure marks the request failed, visibly), `POST /api/webhooks/stripe` (raw body, verify, then apply), `/payments` page (list with live status, refunds, failures, Open checkout), nav entry, dashboard "Collected this month" = verified gross minus confirmed refunds (needs `opportunity.value.view`).
- Tests: 15 Vitest cases with signed payloads (valid, forged secret, altered body, stale/future timestamp, malformed header, multi-v1, duplicate delivery, malformed event, no secret, apply failure -> 500).
- Webhook tenant resolution deviates from the spec's per-workspace opaque endpoint ID: one platform Stripe account, tenant taken from the DB row we created for that session. Documented in SECURITY_MEASURES.
- NOT PROVEN: a real Stripe test-mode payment/refund. Needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and a public `APP_URL` (webhook endpoint `https://<app>/api/webhooks/stripe`, events: checkout.session.completed, checkout.session.expired, checkout.session.async_payment_succeeded, checkout.session.async_payment_failed, payment_intent.payment_failed, charge.refunded). Evidence is captured after deploy.
- PR #15 review fixes (migration `20261018000014_stripe_review_fixes.sql`, applied; SQL suite now 44/44; Vitest 69): `attach_checkout_session` and `fail_payment_request` are service-role only (a user can no longer bind a foreign session or fail a request; reasons are fixed codes, never provider text); `create_payment_request` also needs `crm.view`; paid events must carry matching `metadata.payment_request_id`; rejected deliveries dedupe by payload hash with a counter and are pruned after 30 days; a cron sweep fails pending requests without a session after 15 minutes; apply failures are logged (ids only) and leave a counted trace row. Amounts must have at most two decimals; the nav entry needs `payment.create`.
- Known/accepted: `charge.refunded` on newer Stripe API versions may omit the per-refund list, so `payment_refunds` can stay empty while the cumulative refunded amount (and revenue) stays correct; events that arrive before their session is attached are recorded as ignored (the attach window is milliseconds); no concurrent-delivery test (argued from the unique index, not proven).

## 9. Integrations center (I5): branch `feat/integrations-center`
`/settings/integrations` is now real (sample data removed): per-provider cards for Stripe, Google Calendar and email alerts (state from this deployment's configuration, last success, last failure, plain-language limits, Stripe webhook URL; env values never shown), plus an event log of `integration_events` and outbox alerts for the workspace with a **Retry** button for failed/dead alerts. Requires `integrations.manage` (403 state otherwise). Migration `20261018000015_retry_outbox.sql` (applied; 9/9 SQL assertions in `supabase/tests/retry_outbox.test.sql`): `retry_outbox_event` is tenant-scoped, only for failed/dead rows, audited. Google card shows configuration only until the Calendar slice adds connection status. Rejected webhook deliveries have no workspace and are intentionally not shown here.

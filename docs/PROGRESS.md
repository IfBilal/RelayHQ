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

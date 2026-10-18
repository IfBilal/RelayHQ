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

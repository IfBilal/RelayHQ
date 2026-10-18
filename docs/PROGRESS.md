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

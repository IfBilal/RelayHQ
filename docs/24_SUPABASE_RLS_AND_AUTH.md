# Supabase Auth, Multi-Tenancy, RLS and Permission Model — Implementation Specification

## End-user identity
Supabase Auth owns `auth.users` and password hashing. Use `@supabase/ssr` cookie clients for Next.js App Router. Server verifies user with Supabase Auth (follow current docs) on privileged actions; never trust a frontend role string, localStorage claim or arbitrary `workspaceId`. Sign-up: Auth user → server-managed transaction creates workspace, Owner membership, pipeline default, routing rules and writes audit. Account-switcher verifies selected workspace membership on each request. Sign-out revokes/clears session according to Auth API.

## Role model from source problem
Base levels Owner, Admin, User. **Manager is a permission-set preset**, not a hard-coded fourth base role. Owner can invite/assign, Admin cannot modify Owner; granular flags must include `crm.view`, `crm.create`, `crm.edit`, `crm.delete`, `crm.export`, `opportunity.value.view`, `assignment.manage`, `integrations.manage`, `audit.view`, plus lead/inbox/appointments controls. Each record can apply ownership restrictions *within* workspace; workspace membership alone does not imply access to every sensitive record.

## RLS policy plan
Per tenant table:
- RLS enabled + minimal SELECT/INSERT/UPDATE/DELETE GRANTs.
- `workspace_id` associated with `(select auth.uid())` via active membership.
- Effective action permission resolved against live `memberships` and `role_grants` (not stale JWT custom claims); privileged operation checks *both* RLS and permission functions.
- Writing financial status, owner, lead deadline, or immutable log fields is **not** permitted via ordinary authenticated Data API updates; use reviewed narrow SQL transition functions behind verified server handlers.
- `private` schema for service tokens, SQL helpers, sensitive integration configuration; no exposed-schema security-definer functions.
- Exposed views are `security_invoker=true` when appropriate, and are tested as a separate surface.

## Example conceptual policy (illustrative — adapt to actual schema)
```sql
alter table public.contacts enable row level security;

-- A private, pinned-search-path security-definer function is responsible
-- for checking active membership and per-action permission.
create policy contacts_select
on public.contacts for select to authenticated
using ((select private.has_workspace_permission(workspace_id, 'crm.view')));

create policy contacts_insert
on public.contacts for insert to authenticated
with check ((select private.has_workspace_permission(workspace_id, 'crm.create')));
```
**Do not deploy the example alone.** Define, audit, grant and unit-test `private.has_workspace_permission` first. It must verify the real authenticated principal, active tenant membership and action and must not rely on user-controlled parameters to override identity. Revoke broad defaults; test direct Data API requests. Policy syntax must be validated with Supabase CLI.

## Financial field protection (critical F1.4)
A row-level rule does **not** selectively hide one column from users who may see the row. Put opportunity value in restricted private table (`private.opportunity_financials`) with tenant compound FK, make a value-free public opportunity view/table accessible to ordinary readers; expose money through permission-gated server read/RPC and do not let restricted users select that private table. Also apply to board totals, detail pages, exports and metadata, and to Realtime payloads. If using column grants, verify actual granted roles align with per-user permissions (a shared `authenticated` DB role alone is insufficient).

## Bootstrap atomicity
Use one trusted transaction for workspace creation and Owner membership. Do not allow arbitrary user to create membership with role Owner by posting JSON. Invite token includes intended workspace/user/email and is verified once before fixed membership insert. Updating base role or permission grant is audited; Admin cannot modify Owner even if another permission exists.

## Verification suite (`supabase test db` + API E2E)
- Anonymous tries every user table → no access except constrained public intake route.
- Workspace A User reads B contact/opportunity IDs → none, even with guessed UUID.
- Workspace A User attempts A Owner role escalation → rejected, audit unchanged.
- A User with `crm.view` and no `opportunity.value.view` opens board/contact/export/direct Data API → zero amount exposure.
- Revoke `crm.edit` mid-session → next mutation denied without requiring re-login.
- A Member can view permitted same-workspace record, denied when disabled.
- Browser bundle, HTML source, API error, audit and integration event pages never expose tokens.
- User tries to update payment `paid`, lead `owner_id`, audit or outbox via direct client → denied.
- Supabase Realtime subscription to other workspace channel or rows → denied.

## Official references
https://supabase.com/docs/guides/auth/server-side
https://supabase.com/docs/guides/auth/quickstarts/nextjs
https://supabase.com/docs/guides/database/postgres/row-level-security

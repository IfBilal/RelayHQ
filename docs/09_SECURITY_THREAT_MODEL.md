# Security Threat Model — Next.js, Supabase RLS and Real Provider Webhooks

## Assets and attackers
Protect: per-workspace CRM/contact data, opportunity revenue values, identity sessions, provider secrets/OAuth refresh tokens, payment references, immutable activity, and operational ownership. Attackers: anonymous form spammers, authenticated low-permission users, members of another workspace, forged webhook senders, malicious content senders, and compromised integration accounts.

## Trust boundaries & controls
| Threat | Defense | Negative evidence |
|---|---|---|
| Forged login / cookie session | Supabase Auth with `@supabase/ssr`; server-side verified identity, secure cookies; rate limiting | tamper/expired cookie denied, logout and refresh |
| Horizontal tenant IDOR | RLS on every exposed tenant table, `(workspace_id,id)` FKs, derived actor membership | tenant A cannot fetch/modify B IDs in UI, REST or Data API |
| Permission bypass | Fixed `has_permission(auth.uid(),workspace_id,action)` DB checks + route guards | User cannot use owner settings/other lead reassignment direct call |
| Sensitive value leak | Private financial value storage or no direct read grants, gated read projections/RPC + export serialization | User sees neither value nor inference via list/detail/export/API |
| Broad privileged DB key | Service key only server, no generic admin passthrough, strict tenant mapping, scoped actions | adversarial workspaceId/request DTO fails |
| SQL injection | SQL parameter binding, validated filters, never interpolate field names/operators | filter AST parser rejects unknown operators/keys |
| Cross-site scripting | React escaping, no unsafe HTML; sanitize message rich content; CSP | script payload shows inert text |
| CSRF | SameSite+secure cookie, Origin checks for mutations, framework protections for Server Actions, no state mutations through GET | cross-origin POST rejected; provider routes separately signed |
| Webhook forgery | Stripe raw `Stripe-Signature`, Twilio `X-Twilio-Signature` over exact externally configured URL | altered payload/signature rejected + event logged safely |
| Webhook duplicate/reorder | unique provider event keys; idempotent event state machine, guard regressions | duplicate invoice/refund counts once |
| Google OAuth state theft | signed one-time state tied to authenticated user+workspace; PKCE where supported; registered redirect; tokens encrypted | replayed/wrong-session OAuth callbacks denied |
| Race / failed scheduled jobs | DB timestamps, atomic locks/CAS, `FOR UPDATE SKIP LOCKED`, Cron run records, outbox retries | 2 concurrent escalations → exactly one owner/history |
| Audit editing | RLS read-only, no user UPDATE/DELETE grants; controlled append-only server actions | edit audit API / PostgREST denied |
| Server-side request forgery | Provider URLs fixed in config; no arbitrary webhook forward URL | attacker URL payload cannot initiate server GET |
| Credential disclosure | `private` schema, envelope encrypted tokens, least privilege, log redaction, secrets in deploy env | client build and logs contain no secrets |
| Public endpoint abuse | rate limit, bot protection, payload bounds, source idempotency | flood throttled; invalid email rejected |
| Subscription data leak | RLS-protected Realtime publication policies; IDs only; refetch scoped | workspace B cannot see A events |

## Must-implement RLS and grants checklist
1. Every `public` table in an exposed schema uses `ENABLE ROW LEVEL SECURITY`; add appropriate SELECT/INSERT/UPDATE/DELETE policies and **SQL grants**, test `anon`/`authenticated`/cross-workspace. RLS without proper GRANTs is not a complete permissions design.
2. Avoid security-definer views. Exposed views that require caller RLS use `security_invoker=true` (supported PG versions); test them explicitly.
3. `SECURITY DEFINER` helper functions live in a non-exposed `private` schema, use `SET search_path = ''`, schema-qualified SQL names, explicit grants and authenticated caller checks. Do **not** expose privileged arbitrary RPC in `public`.
4. The signed provider callback is the ONLY pathway allowed to mutate provider-confirmed payment status. No client may set `paid` or refund totals.
5. Admin client bypasses RLS; inspect all use sites and require verified tenant and fixed provider event/worker operation. Never accept requested `workspaceId` at face value.
6. Cross-workspace scenario includes composite FKs to prevent attaching B's contact to A's payment, even when IDs guessed.

## Release security matrix
Actors: anonymous, A Owner, A Admin, A Manager preset, A regular User with/without `opportunity.value.view`, B Owner. Resources: same-owned contact, other team's contact, B record, opportunity value, role grant, audit, integration credential, message send opted-out, webhook endpoint, outbox job. Test read, write, export, direct `supabase.from()`, direct `/api/v1`, realtime.

## Provider-specific pitfalls
- Twilio WhatsApp **Sandbox uses shared test destination**; one sandbox setup cannot safely route arbitrary inbound phones to multiple workspaces by phone alone. For demo, map to explicitly configured demo tenant and label it sandbox-only; for real multi-tenant product require tenant-distinct inbound number/subaccount or verified association.
- Stripe callback must locate tenant integration via opaque endpoint ID and verify signature using that integration's secret **before** touching data; do not use a user-supplied workspace claim.
- Google connect and OAuth callback reject revoked/expired tokens and show reconnection; refresh token never appears in a browser response.

## Signed event audit
For rejected webhook log provider, endpoint key, timestamp, failure reason, correlation/request ID, and redacted payload hash only; never secrets/full sensitive payload. Return suitable HTTP status without causing repeated permanent bad mutations.

## References
https://supabase.com/docs/guides/database/postgres/row-level-security
https://supabase.com/docs/guides/auth/server-side

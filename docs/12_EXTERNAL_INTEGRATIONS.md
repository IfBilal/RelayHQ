# Real Provider Integrations — Webhooks, OAuth, Reliability

**Provider choice:** Twilio WhatsApp Sandbox (SMS fallback approved by source), Stripe Test, Google Calendar OAuth 2.0, Resend transactional email (I4 choice). **All must be real test/sandbox calls**, not fake UI. Use configured, publicly reachable HTTPS callback URLs. Provider docs can change: verify dashboard settings before demo.

## I1 Twilio WhatsApp (critical)
**Preflight:** create Twilio account/subaccount per workspace if feasible; register/join test handset to WhatsApp sandbox; configure incoming + message status callback URLs including opaque integration identifier; keep account secrets encrypted server-side. A single shared demo account cannot legitimately represent independent workspaces without per-workspace isolation; if using one account for demo, mark workspace-specific credentials setup incomplete until split.

**Inbound:** Next.js Route Handler `request.formData()` or parsed URL-encoded body → integration lookup by public nonsecret ID → validate `X-Twilio-Signature` using SDK with **exact configured public URL** + all form parameters → dedupe `MessageSid` → normalize `From` E.164 without `whatsapp:` prefix → find contact by workspace + phone; if unknown create contact+lead through core intake → create conversation/message, assign employee and append activity → commit → 200 TwiML/empty as appropriate.

**Outbound:** check permission, owner/channel, recipient opt-out and sandbox membership constraints; create `queued` message and outbox; protected outbox dispatcher sends via Twilio SDK with statusCallback URL; store provider SID; callback updates sent/delivered/failed. Failed send persists reason with bounded retry or manual retry; duplicate callbacks idempotent. Opt-out blocks send **server-side**.

**Source:** https://www.twilio.com/docs/usage/webhooks/webhooks-security

## I2 Stripe Test
Create hosted Checkout Session from opportunity using selected currency + amount_minor, attach immutable local `paymentId` in metadata and `client_reference_id`; store `sessionId`, `status=pending`. Employee may send hosted URL by permitted channel. Show return page as “Processing confirmation” until verified webhook arrives.

`POST /api/webhooks/stripe/:publicIntegrationId`: raw body and `Stripe-Signature` verified with matching configured endpoint secret → unique event key dedupe → lookup local payment via session/payment intent and verify amount/currency/workspace consistency. Handle `checkout.session.completed` with appropriate payment_status checks, `checkout.session.expired`, `payment_intent.payment_failed`, and refund events such as `charge.refunded` / supported refund events; fetch provider object where needed because ordering is not guaranteed. Model separate `pending/paid/expired/failed/refunded/partially_refunded`; store individual refund IDs to avoid counting refund twice. **Collected revenue = verified gross payments minus verified refunds**, only in matching period/currency policy; never add projected opportunity amount to collected cash.

**Sandbox demo:** use official published Stripe test card; trigger duplicate delivery with Stripe CLI or recorded signed event; make dashboard payment update without client-success mutation.
**Docs:** https://docs.stripe.com/webhooks and https://docs.stripe.com/payments/checkout

## I3 Google Calendar
Admin/employee starts OAuth consent for **their own Google account**, `state` opaque single-use and bound to user/workspace. Scopes only needed to read FreeBusy and manage calendar events, requested with consent/offline access. Encrypt refresh token at rest; automatically refresh access on expiry; user reconnects on `invalid_grant`/revocation. Google OAuth test app may require pre-approved testers and testing-mode refresh tokens may expire earlier: plan demo calendar connection at kickoff.

Before insert: `freebusy.query` on selected employee calendar, timezone-aware UTC interval, reject/explicitly warn on overlap, recheck immediately before insert to reduce race (Google events are external; no fully atomic lock); store returned event ID, local sync status. Reschedule via Google `events.patch`, cancel via `events.delete` + local state and audit. Provider unavailable → pending/error, no invented confirmed appointment. Store UTC instants plus IANA tz.
**Docs:** https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query

## I4 Resend email for escalation
Each user configures verified destination email. Verify permitted sender/from domain under provider account, or provision a validated testing sender; don't invent arbitrary from email. Enqueue notification via outbox on **committed owner change**. Content includes lead name, original source, reason, secure link to lead (access checked when opened). Track attempt, external message ID, accepted/delivered if provider supports events, last error and exponential backoff (e.g. 3 tries at 5s/20s/60s). Deadline requirement “within same minute” should be verified on an actual test message under normal conditions, not guaranteed through an outage.
**Docs:** https://resend.com/docs

## I5 Integration center / shared invariant
Table `integrations` per workspace/provider with encrypted credentials or OAuth tokens, statuses `not_connected|connected|degraded|error|revoked`, last successful provider response and last error. Table `integration_events` stores provider refs, direction, payload hashes/allowlisted metadata, attempts, redacted errors. Admin can filter recent events/retry recoverable outbound tasks. Provider calls are independently circuit-breakable; Stripe outage must not break lead capture.

## Credential/demo readiness checklist
| Provider | Needed before building | Real test | Failure proof |
|---|---|---|---|
| Twilio | Sandbox sender, joined test phone, API creds, HTTPS callbacks | Inbound phone → contact and reply phone | invalid sig, duplicate SID, failure/opt-out |
| Stripe | test account/key/endpoint secret, HTTPS callback | hosted payment → signed webhook | duplicate, failed, expired, refund |
| Google | Cloud project, API enabled, OAuth consent/test user | consent, FreeBusy, real event create/reschedule/cancel | busy overlap, revoked OAuth |
| Resend | sender verified / test-safe sending, per-user destination | escalated lead → real inbox | unreachable recipient, retries logged |

## Callback security verification
Never trust payload simply because provider IP or a route name matches. Verify cryptographic signature/state **before mutation**, and ensure callback tenant identity is mapped to the credential that actually verified it. Keep detailed logs but redact tokens/phone bodies when not needed. Outbound side effects use idempotency keys and bounded retries; provider call success is not a substitute for final Stripe payment confirmation.

## Stack-specific transport note
These integrations are implemented as Next.js App Router Route Handlers (`src/app/api/webhooks/...`) and fixed server-only feature modules, not Express. All secret values stored in server env or encrypted private Supabase schema; signed ingress must determine workspace by endpoint-integrations mapping. Outbound retry runs from Supabase Cron-triggered, protected outbox dispatcher; no Redis / always-on worker. **Twilio shared Sandbox is single-workspace demonstration unless unique incoming tenant mapping is guaranteed.**

# Judge Demo Runbook — 6–8 Minute Core Story + Security Proof

## Theme and story
“A new customer reaches us while the assigned sales rep is unavailable. RelayHQ recognizes that, routes to the right person, escalates automatically when nobody responds, records who was accountable, and keeps every next customer interaction in one trustworthy view.” The UI is a purposeful operations command center, not 12 feature slides.

## Before demo, verify live dependencies
- Deployment URL resolves with SSL; sessions and Supabase Realtime healthy, Supabase Cron recent successful run and outbox healthy, all four provider credentials valid/test-mode and webhooks pointed to deployed URLs.
- Real test WhatsApp phone joined Twilio sandbox; Stripe hosted card flow and webhook endpoint validated; Google test account connected and visible on real calendar; Resend sender and team inbox receive mail.
- Two separate workspaces seeded; 3 employee accounts with availability and permissions; one User lacks opportunity-value permission.
- Escalation settings **temporarily 20–30 seconds for demo** (configured through UI; not code patch), and two backup levels; reset to safe defaults after.
- Browser clean guest windows for Owner, rep and separate workspace; failure scenarios ready but not pre-faked.

## Live script / judge-facing evidence
| Time budget | Presenter action | System proof | Scoring target |
|---|---|---|---|
| 0:00–0:45 | Open Dashboard; show rescue-first layout | real current metrics + three drilldowns | UI/UX + product clarity |
| 0:45–1:30 | Owner opens assignment rules, shows availability and 20s SLA | persist config, permission/audit | customization and logic |
| 1:30–2:30 | Send WhatsApp from real joined phone or public form; lead appears and assigned | Twilio signed inbound ID, one owner, live Supabase Realtime | real integration + full stack |
| 2:30–3:15 | Leave unacknowledged until expiry; show new owner and external email | countdown→Supabase Cron change→audit; real inbox email | critical path + resilience |
| 3:15–4:00 | Open recovery queue and Contact 360; acknowledge; show conversation and activity | source, reason, owner, timeline, reply phone | useful UI + traceability |
| 4:00–5:00 | Create Stripe Checkout; complete hosted test card | webhook updates paid and dashboard collected | provider security + data correctness |
| 5:00–6:00 | Connect/inspect Google event; show FreeBusy and book | actual calendar event + contact appointment | OAuth and scheduling |
| 6:00–7:00 | Show custom field and stage-required move blocked, then corrected | true server-side validation | CRM customization |
| 7:00–8:00 | Cross-tenant API request + hidden value User + concurrent DB expiry test | 404/403/no JSON leak; one audit entry | security/concurrency |

**If strictly six minutes** combine 3:15–4:00 and 6:00–7:00, keep security proof. Demo clarity matters more than wandering across all screens.

## How to prove external events are real
Twilio: provider request log & connected handset receive event (mask number). Stripe: hosted checkout plus signed webhook event history, ID and local payment record. Google: event visible in external calendar tab. Resend: destination inbox receives escalation message with lead URL. Don't show private tokens. Don't mark untested connection as green.

## Failure demonstration (optional 60s if judges ask)
Send duplicate signed webhook / retry Cron/outbox attempt — only one event stored. Stop/unavailable Next.js briefly — DB Cron continues and recovers due deadlines. Simulate provider credential issue — error shown in Integration Center; core CRM still works. Explain emergency Owner fallback prevents null ownership with no Available reps.

## Fallbacks, without deception
Provider outage: show real persisted prior provider event + integration error health. If Google token revoked, show reconnect and failed booking UI, not a fake appointment. If WhatsApp sandbox not joined, use public web form for intake demo *while openly identifying Twilio as blocked*. Test fixture data can be preseeded only for UI breadth, clearly called sample, never misrepresented as webhook evidence.

## Judge Q&A bullets
- **System design:** modular monolith, Postgres source of truth, outbox+Supabase Cron retry, Supabase Realtime advisory.
- **Concurrency:** DB row CAS/Serializable tx and event unique keys; Next.js restart with persisted deadline sweep.
- **Security:** workspace filter+composite FK, Supabase Auth cookie sessions, RLS + permissions, safe field projection on API/export; signature validation and OAuth state.
- **Business:** measurable first response (from first assignment to first ack) and net confirmed payments only.
- **UX:** neutral canvas, calm teal actions, amber/coral escalation semantically; lead risk dominates dashboard, compact board and Contact 360.

**Live-demo architecture:** Vercel Next.js hosted app, Supabase Auth/Postgres/Realtime/Cron, real Twilio/Stripe/Google/Resend sandbox/test events. Static HTML screenshots are reference mockups only.

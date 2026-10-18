# Operational Dashboard, Reports and Shared Metric Definitions

## The dashboard is an operations screen
One clear top banner “Your pipeline is protected / needs attention”, four concise KPIs, a visible recovery queue, a compact distribution/response chart, employee availability and next appointments. Charts never outrank urgent lead actions.

## Metric contracts (source glossary wins)
| Metric | Formula / time boundaries | Drill-down | Security |
|---|---|---|---|
| New leads today | count `created_at` within workspace-local calendar day (stored UTC) | leads created today | own vs all by role |
| Time to first response (average) | average(`first_acknowledged_at` − `first_assigned_at`) for acked leads in filter window; **not median** | same leads | User own only |
| Escalations 24h | count system `lead.escalated` events `occurred_at >= now-24h`; manual reassign excluded | audit/lead list | team permission |
| Recovery queue count | count **distinct leads** matching unack deadline OR escalation_count≥2 OR idle threshold OR emergency flag | recovery filtered list | own/company |
| Open pipeline value by stage | sum `opportunities.value_minor` in stages not won/lost | stage filter | hidden without value permission |
| Available staff | memberships status Available AND open lead count < cap | team status | manager/team |
| Upcoming appointments | future noncancelled appointments in selected window | upcoming list | permitted contacts only |
| Payments received this month | sum verified Stripe payments settled/confirmed this month minus verified refunds *by reporting rule* | payment records | permission gated |

## Critical finance semantics
`Projected` = opportunity value/open requests; `Collected` = provider-confirmed money net of confirmed refund events. Distinguish booked date, payment confirmed date, refund date: show monthly cash net using **events occurring in current month** and optionally lifetime collected on separate card. Never mix currencies without explicit FX conversion; initially show only configured workspace default currency and either exclude other currencies with explanation or group by currency. Store minor units as integers/Decimals.

## Server computation
Use shared `reporting` service; no client-side totals from only first page of results. Protect every underlying query by workspaceId + record visibility. Return `visible: false` for restricted widgets or omit them; widget visibility config per user stored in DB.

Example response (illustrative):
```json
{"serverNow":"2026-10-18T10:00:00Z","currency":"USD","metrics":{"newLeadsToday":18,"averageFirstResponseSeconds":145,"recoveryCount":3,"escalations24h":7,"collectedMinorThisMonth":1285000},"drilldowns":{"recovery":"/leads/recovery"}}
```
Do not allow saved visibility toggles to bypass permission; always compute permission mask on server. Cards show loading, empty and error states with accessible labels and units.

## Drill-down consistency tests
- Create 3 leads, acknowledge 2 at known fixed times; dashboard average matches raw records.
- Two recovery reasons on one lead count once.
- Manually reassign → escalation count unchanged.
- Stripe redirect without webhook → money unchanged; signed webhook increments once; duplicate remains once; refund decrements.
- Value-hidden User: no value widget, no leaked value in other widget hover/title or raw API response.
- Toggle widget visibility, reload page, state persists.

## Live update
Supabase Realtime event invalidates TanStack Query keys; refetch from server to avoid shadow counters. User has “live” marker with as-of time; reconnect triggers full refresh. Do not claim zero-latency delivery or exactly-once Supabase Realtime.

> **SCOPE (2026-10-18): all messaging is OUT OF SCOPE** (I1: no Twilio, WhatsApp, Telegram, inbox/conversations, messaging webhooks). Ignore every messaging mention in these docs; do not build it. In scope: Stripe (I2), Google Calendar (I3), SMTP email alerts (I4/F3.9), integrations center for those three (I5). The `/inbox` screen, its nav entry and the `twilio` dependency were removed.

# RelayHQ — Complete Hackathon Build Handbook

**Source:** `../problem statement.md` · **Architecture decision:** Next.js App Router + Supabase PostgreSQL · **Status:** implementation specification, not running app · **Visual identity:** proposed (not mandated) · **Updated:** 2026-10-18.

> RelayHQ is a provisional product name. The problem statement names a “Unified Business Management Platform” and does not mandate a name, stack, specific branding, or time limit. This package proposes a premium operational visual theme and uses the team's confirmed **Next.js + Supabase** technology choice. Static HTML mockups are visual references with illustrative records, not evidence of completed APIs or provider integrations.

## Mission
Prevent neglected inbound leads for service businesses of 5–30 staff. Every lead has exactly one accountable owner; availability-aware routing and durable escalation ensure action, while customizable CRM, communications, Stripe payments and Google appointments connect to one audited customer record.

## Deliverables
- Original problem statement copied here untouched.
- **27+ detailed Markdown specifications** covering PRD, screen behavior, architecture, SQL/RLS, auth, assignment concurrency, integrations, observability, testing, security, Git collaboration, every implementation session, demo and traceability.
- `mockups/index.html`: interactive **static UX prototype** demonstrating pages, navigation and mobile layout; fixture data only.
- `screenshots/*.png`: desktop and mobile visual references to implement with Next.js.
- `assets/tokens.css`: agreed design system colors and typography reference.

## Orientation
| Read first | Purpose |
|---|---|
| `02_PRODUCT_DESIGN_BRIEF.md` | Product meaning, audience and visual principles |
| `03_DESIGN_SYSTEM.md`, `04_SCREEN_SPECS.md` | Specific type, palette, grids and screens |
| `01_PRD.md` | Stories, acceptance criteria and scope |
| `05_ARCHITECTURE.md`, `06_TECHNICAL_STACK.md` | **Confirmed** application architecture |
| `24_SUPABASE_RLS_AND_AUTH.md` | Tenant isolation, permissions and data exposure |
| `25_SUPABASE_SQL_AND_TRANSACTIONS.md` | Database functions, Cron and transaction protocol |
| `16_END_TO_END_IMPLEMENTATION_PLAN.md` | **Central session-by-session execution plan** |
| `17_CRITICAL_PATH.md`, `18_PARALLEL_WORK_AND_GIT.md` | Dependency diagram, branch ownership and merge rules |
| `22_REQUIREMENTS_TRACEABILITY.md` | All F/I/Q acceptance requirements |
| `23_CLAUDE_AGENT_HANDOFFS.md` | Copy/paste session context to Claude |

## Fixed engineering decisions
| Domain | Tool / technique |
|---|---|
| Full-stack | Next.js App Router, TypeScript, React Server Components, Route Handlers, Server Actions where appropriate |
| Data | **Supabase PostgreSQL** (not Firebase, MongoDB, Prisma or separate Postgres deployment) |
| Identity | Supabase Auth with `@supabase/ssr` cookies, verified server identity |
| Authorization | Postgres RLS + restricted `private` schema functions + application permission checks |
| Realtime | Supabase Realtime for scoped event invalidation and fresh reads |
| Durable scheduling | Supabase Cron / `pg_cron` operating on persisted `deadline_at` rows, SQL locking and idempotency |
| Outbound background effects | Transactional DB outbox + scheduled dispatch through a protected server endpoint / Edge Function |
| Hosting | Vercel for Next.js, Supabase cloud for database/auth/realtime/cron |
| Styling | Tailwind CSS + shadcn/ui + Lucide icons, **custom RelayHQ tokens** |
| Forms, charts and QA | Zod, React Hook Form, TanStack Query where needed, Recharts, Vitest, Playwright, `supabase test db` |
| External integrations | Twilio WhatsApp Sandbox, Stripe test Checkout, Google Calendar OAuth, Resend email for escalations |

## Release-gate truths
1. Owner and workspace are derived from verified Supabase identity; JWT UI role alone is never authority.
2. **All tenant-owned tables use RLS**, grants and negative tests. High-risk financial information is exposed only through vetted permission-aware projections, not a masked browser-only field.
3. A lead never has two owners; no eligible employee routes to a designated Owner emergency owner, with explicit recovery flag.
4. Expiry runs from persisted DB deadlines, not client countdown or in-memory `setTimeout`.
5. Provider-signed, deduplicated webhooks confirm Twilio/Stripe states, not the browser redirect.
6. All important actions and provider failures are traceable and visible to permitted staff.
7. No claims that fixtures, email simulations or screenshots constitute live integration evidence.

## Missing inputs / decisions to confirm
- Hackathon start and end, so sessions can be mapped to exact hours (the plan currently uses logical sessions).
- Team count and which person owns backend/security, UI, integrations.
- Existing product identity, if judges provided one; otherwise RelayHQ is proposed.
- Access to credentials, verified Resend sending domain, Twilio joined phone, Stripe test keys, Google OAuth test users, and HTTPS deployment.
- Exact production region/timezone and whether a public lead form requires CAPTCHA.

## Definiton of complete
Full application on public HTTPS domain, repeatable migrations/seeds, real provider flows and negative security tests, live lead escalation demonstrated by the scheduler, all mandatory F/I/Q evidence, and a 5–7 minute judge demo with failover route.

## Primary official implementation resources
- Supabase Next.js quickstart: https://supabase.com/docs/guides/auth/quickstarts/nextjs
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side
- Supabase RLS: https://supabase.com/docs/guides/database/postgres/row-level-security
- Supabase Cron: https://supabase.com/docs/guides/cron
- Next.js Route Handlers: https://nextjs.org/docs/app/api-reference/file-conventions/route

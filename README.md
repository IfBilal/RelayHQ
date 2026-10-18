# RelayHQ Hackathon Blueprint — Next.js + Supabase

This is a **documentation and UI-prototyping package**, not an implemented app. The uploaded problem statement is included verbatim. The team confirmed **Next.js App Router and Supabase PostgreSQL**; the plan also proposes Supabase Auth, Realtime and Cron.

## Start
1. Read `docs/00_START_HERE.md`.
2. Review the premium UI direction `docs/02_PRODUCT_DESIGN_BRIEF.md`, design system `docs/03_DESIGN_SYSTEM.md`, screen contracts `docs/04_SCREEN_SPECS.md`.
3. Open `mockups/index.html` in your browser and navigate through eight UI screens. It uses illustrative sample data only.
4. View PNG desktop/mobile references under `screenshots/`. PNGs are designer-produced conceptual references, not automated browser captures.
5. Plan development from `docs/16_END_TO_END_IMPLEMENTATION_PLAN.md`, `docs/17_CRITICAL_PATH.md`, `docs/18_PARALLEL_WORK_AND_GIT.md`.
6. Give Claude the relevant agent handoff from `docs/23_CLAUDE_AGENT_HANDOFFS.md` with source requirements and final API contract.

### Confirmed stack
- Next.js App Router + TypeScript
- Supabase PostgreSQL, Auth, Row Level Security, Realtime, Cron
- Tailwind CSS + shadcn/ui + Lucide
- Twilio WhatsApp Sandbox, Stripe test Checkout, Google Calendar OAuth, Resend notifications
- Vercel deployment with HTTPS

Provider credentials and availability should be verified independently at kickoff. Never treat visual mockups as proof of a working backend or real integrations.

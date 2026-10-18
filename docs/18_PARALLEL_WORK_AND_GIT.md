# Parallel Development / GitHub Branching — 3 Machines, 2–3 Team Members

## Team ownership matrix
| Area | A platform/security | B frontend/design | C CRM/providers |
|---|---|---|---|
| `supabase/migrations`, RLS + tests | **Owner / final merge** | read | proposed migration PR |
| `src/contracts` | **Contract owner** | reviewer | reviewer |
| `src/lib/supabase` | **Owner** | read | read |
| `src/features/leads/server` + Cron | **Owner** | read | use API |
| `src/components`, `src/app/(app)`, design | reviewer | **Owner** | read |
| `src/features/crm` | DB review | UI integration | **Owner** |
| `src/features/{messaging,payments,calendar,integrations}` | security review | UI integration | **Owner** |
| Test fixtures and demo | race tests | Playwright visual | provider sandbox |

## Create branches after S01 baseline
```bash
git checkout main && git pull --ff-only
git checkout -b feat/bootstrap-supabase       # A
# On B laptop (after S01):
git checkout -b feat/ui-foundation           # B
# On C laptop (after S01):
git checkout -b feat/crm-contracts           # C
```
When a PR merges, other branches fetch latest main; prefer `git rebase origin/main` only if the branch has not been shared or agree with collaborators. Protect `main` with required build/test checks; never `git push --force` on main.

## Concurrent sets allowed
- **Set Alpha:** A bootstrap+RLS, B AppShell+design system, C API DTO/CRM data model proposal. A merges SQL after C's review.
- **Set Beta:** A lead engine, B bound dashboard/recovery, C CRM custom fields. Requires merged contracts/CRM tables.
- **Set Gamma:** A Cron/outbox, B live inbox/recovery visuals, C Twilio messaging. Needs stable lead schema/event DTO.
- **Set Delta:** A metrics/security QA, B final screen polish/accessibility, C Stripe then Google. **Stripe and Google are not simultaneous if C works alone**.
- **Set Epsilon:** A security suite, B UI E2E, C provider failure suite. Requires feature freeze.

## Not safe in parallel
- Two contributors editing same numbered Supabase migration; two developers independently changing RLS permission function; implementing provider data structures without frozen DTO; publishing production callback URL before verified signing design; final release smoke before integration merges; agent edits across owners without PR.

## Handshake contract before each parallel wave
Issue comment template:
```md
Session: S__
Developer: A|B|C
Branch: feat/...
Prerequisite merged PRs:
Files/modules owned:
Schema change needed? SQL request to A:
API contract affected? exact shape:
Requirement IDs:
Acceptance + negative tests:
Screenshots / external sandbox evidence:
Blocked by:
```

## PR acceptance review
1. Build, TS, ESLint, tests; migration applies on fresh local Supabase.
2. RLS tests include anonymous, tenant A, tenant B, with and without permissions.
3. UI screenshots 1440/390, empty/loading/error/access denied, keyboard focus.
4. Provider claims show real test webhook IDs and sanitized screenshots/logs.
5. No secrets, unsafe privileged client, unbounded query or background `setInterval`.
6. Updated docs/traceability/contract if behavior changed.

## Per-laptop setup
All use same Node major / package lock, `.env.local` local only, preconfigured Supabase dev project or separate local CLI stacks, and shared seeded fixtures. **Never run destructive reset on a shared remote Supabase project.** Developers with separate local Supabase containers can reset freely locally; merge migrations after A review, then deploy to shared staging once.

## Two-person adjustment
A becomes both platform/lead and provider implementer, serializing A's lead/Cron → Twilio → Stripe → Google workload; B keeps visual + CRM/read model features. A and B merge only at stable interface checkpoints. Avoid the illusion that four provider tasks run at the same time with only one backend developer.

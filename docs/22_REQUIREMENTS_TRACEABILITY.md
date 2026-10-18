# Complete Requirement Traceability — Problem Statement → Owner → Module → Evidence

All source IDs refer to `../problem statement.md`. This table prevents “beautiful but noncompliant” output. **Owner labels A/B/C are primary, not the only contributors.** Evidence uses test IDs from `15_TESTING_QA_AND_SECURITY_GATES.md`; if a test has not yet been implemented, treat mapping as a planned test, never a claim of passing.

| Source | Requirement cluster | Primary owner | Implementation | Demo / test evidence |
|---|---|---|---|---|
| F1.1 | Signup/session | A | identity/session DB | T-IDENT-01 |
| F1.2 | Owner/Admin/User | A+B | roles+UI | T-AUTHZ-01 |
| F1.3 | Configurable permission matrix | A | permission policies | T-AUTHZ-01 |
| F1.4 | Opportunity value field protect | A+C | permission projection/list/detail/export | T-AUTHZ-03 |
| F1.5 | Server enforcement | A | policy middleware/service | T-AUTHZ-01 |
| F1.6 | Tenant isolation | A+C | workspace filters/composite FK | T-AUTHZ-02 |
| F2.1 | Contact/company/opportunity relations | C | CRM API/DB | T-CRM-01 |
| F2.2 | Types of custom fields | C+B | metadata+renderer | T-CRM-01 |
| F2.3 | Different fields two pipelines | C+B | pipeline-specific defs | T-CRM-01 |
| F2.4 | Required fields on stage | C+B | server validation+dialog | T-CRM-02 |
| F2.5 | Stage add/rename/reorder/delete, move | C+B | stage API/board | T-CRM-03 |
| F2.6 | 3-filter saved dynamic lists | C+B | safe AST+view | T-CRM-04 |
| F2.7 | Activity history | A+C+B | event timeline | T-CRM-01 + E2E |
| F2.8 | Complete customer view | B+C | Contact 360 | UI E2E |
| F3.1 | Web, Twilio, manual leads | A+C | source intake | T-LEAD-01/T-TWILIO-01 |
| F3.2 | Four employee availability states | A+B | membership/availability | T-LEAD-02 |
| F3.3 | RR/max cap/available only | A | lead transaction | T-LEAD-02/T-LEAD-06 |
| F3.4 | Ack and visible timer | A+B | deadline, ack, countdown | T-LEAD-04 |
| F3.5 | Configurable chain | A+B | durable evaluator | T-LEAD-03 |
| F3.6 | Absence immediate reassign | A | availability service | T-LEAD-02 |
| F3.7 | Recovery reasons/queue | A+B | rules and recovery API | T-LEAD-05 |
| F3.8 | No double action | A | transactions/version/unique event | T-LEAD-03/T-LEAD-04 |
| F3.9 | External escalation alert | A | email outbox | T-EMAIL-01 |
| F4.1 | Core action audit | A+C | audit append inside txn | Security/functional E2E |
| F4.2 | Restricted, filterable audit | A+B | audit service/UI | T-AUTHZ-01 |
| F4.3 | Not editable/deletable | A | API no update/delete | Security E2E |
| F5.1 | All required live KPIs | C+B | reporting | T-REPORT-01 |
| F5.2 | Consistent definitions | C | shared metric queries | T-REPORT-01 |
| F5.3 | 3+ drilldowns | B+C | route/filter links | UI E2E |
| F5.4 | User own vs Owner company | A+C | role-scoped data | T-AUTHZ-03 |
| F5.5 | Persist widget visibility | B+C | user preference | T-REPORT-01 |
| I1.1 | Phone → signed webhook → UI | C | Twilio inbound | T-TWILIO-01 |
| I1.2 | Signature and forged request | C | Twilio SDK validator | T-TWILIO-02 |
| I1.3 | Platform reply real phone | C+B | Twilio outbound | T-TWILIO-03 |
| I1.4 | Delivery callbacks | C | message status | T-TWILIO-03 |
| I1.5 | Known vs unknown contact | C | scoped matching | T-TWILIO-01 |
| I1.6 | Conversation owner/permissions | A+B+C | conversation guard | T-AUTHZ-02 |
| I1.7 | Failed send/retry | C+B | outbox/message UI | T-TWILIO-03 |
| I1.8 | Duplicate webhook dedupe | C | MessageSid unique | T-TWILIO-02 |
| I1.9 | Opt-out | C+B | channel preference guard | T-TWILIO-03 |
| I2.1 | Payment link/checkout | C+B | Checkout session | T-STRIPE-01 |
| I2.2 | Webhook-confirmed success | C | signed event handler | T-STRIPE-01 |
| I2.3 | Signature | C | raw bytes validator | T-STRIPE-02 |
| I2.4 | Idempotency | C | provider event unique | T-STRIPE-02 |
| I2.5 | Expired/failed/refund | C+B | reconcile/refund logic | T-STRIPE-02 |
| I2.6 | Collected vs projected | C | reporting semantics | T-REPORT-01 |
| I2.7 | Employee+provider reference | C+B | linked payment record | T-STRIPE-01 |
| I2.8 | No card data | C | Stripe hosted page only | T-STRIPE-01 |
| I3.1 | Google OAuth connect/disconnect | C+B | OAuth state/token | T-GOOGLE-01 |
| I3.2 | Refresh and reconnect | C | token refresh | T-GOOGLE-02 |
| I3.3 | Real event from contact/deal | C+B | appointment API | T-GOOGLE-01 |
| I3.4 | Busy overlap | C+B | FreeBusy | T-GOOGLE-02 |
| I3.5 | Timezone correctness | C+B | UTC+IANA | T-GOOGLE-02 |
| I3.6 | Change/cancel + history | C | provider event mutation | T-GOOGLE-01 |
| I3.7 | Connection status | C+B | booking guard | T-GOOGLE-02 |
| I4.1 | Email inside minute | A | Resend queued sender | T-EMAIL-01 |
| I4.2 | Lead/source/reason/link | A+B | mail template | T-EMAIL-01 |
| I4.3 | Per-user destination | A+B | notification settings | T-EMAIL-01 |
| I4.4 | Failure/retry visible | A+B | outbox+events UI | T-EMAIL-02 |
| I5.1 | Provider central status page | B+C | Integrations UI | Provider E2E |
| I5.2 | Per-workspace connections | A+C | tenant config | T-AUTHZ-02 |
| I5.3 | Encrypt/no secrets browser/repo | A+C | secrets + logs | security tests |
| I5.4 | Inbound/outbound history | A+C+B | integration events UI | provider tests |
| I5.5 | Retries/error explanations | A+C+B | outbox/states | T-EMAIL-02 |
| I5.6 | Sandbox limits stated | B | provider help text | UI E2E |
| I5.7 | Permission/audit change | A+C | guarded integrations | T-AUTHZ-01 |
| I5.8 | Provider isolation of failure | A+C | independent retry/boundaries | T-EMAIL-02 |
| Q1 | Hashing/rate-limited revocable sessions | A | auth | T-IDENT-01 |
| Q2 | Server auth/workspace | A | policy/service | T-AUTHZ-01–03 |
| Q3 | Validation/XSS/CSRF | A+B+C | Zod/CSP/token | security suite |
| Q4 | Referential/concurrent integrity | A+C | DB constraints/version | T-CRM-03/T-LEAD-03 |
| Q5 | Race/restart jobs | A | DB deadlines/outbox | T-LEAD-03/05 |
| Q6 | Real DB persistence | A | Postgres | restart E2E |
| Q7 | Phone/tablet/laptop responsive | B | AppShell/components | T-UX-01 |
| Q8 | Accessible keyboard/forms/contrast | B | semantics | T-UX-02 |
| Q9 | Pagination/performance | A+B+C | cursor/filter/query | 500-record fixture |
| Q10 | User feedback | B | states/toasts | UI E2E |
| Q11 | Refresh-free awareness | A+B | Supabase Realtime | T-Supabase Realtime-01 |
| Q12 | Consistent metrics | C | centralized reporting | T-REPORT-01 |
| Q13 | Env/secrets/onboarding | A | configs/README | cold-start proof |
| Q14 | Modular boundaries | A+C | packages and services | code review |

## Follow-up audit
At each wave mark status for each ID as `not started / implemented / tested / demo proven`. A passing screenshot is **not evidence** of webhook authenticity or concurrency safety. Mandatory requirement statuses remain red until a concrete run passes.

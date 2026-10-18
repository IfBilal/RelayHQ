# Next.js Route Handler API Contracts + Supabase Realtime (first shared merge)

**Shared contract rule:** A owns the source schemas in `src/contracts`; B/C import typed DTOs, not handwritten API assumptions. `workspaceId` is derived from authenticated user/membership and route workspace context, never trusted from JSON body. All URLs are examples until implemented.

## Identity and workspace
| Method | Path | Permission | Request → response |
|---|---|---|---|
| POST | `/api/v1/auth/signup` | public | `{name,email,password,workspaceName}` → safe user/workspace + session cookie |
| POST | `/api/v1/auth/login` | public | `{email,password}` → safe user + cookie |
| POST | `/api/v1/auth/logout` | authenticated | revokes session; clears cookie |
| GET | `/api/v1/auth/me` | authenticated | user, selected workspace, effective permission keys |
| POST | `/api/v1/team/invitations` | team.invite | email, base role → invitation status |
| PATCH | `/api/v1/team/:userId/roles` | role.manage | permission changes, audited; cannot touch Owner as Admin |
| PATCH | `/api/v1/team/me/availability` | authenticated | Available/Busy/On leave/Offline |

## CRM and rule editor
| Method | Path | Permission | Contract |
|---|---|---|---|
| GET/POST | `/api/v1/contacts` | contact.view/create | paginated/search + create, relationship validation |
| GET/PATCH/DELETE | `/api/v1/contacts/:id` | contact.view/edit/delete | tenant scope, soft delete, `If-Match` version |
| GET/POST | `/api/v1/opportunities` | opportunity.view/create | dynamic custom fields and permission-aware value |
| PATCH | `/api/v1/opportunities/:id/stage` | opportunity.edit | `{targetStageId,expectedVersion}` → success/422 required-field/409 stale |
| GET/POST | `/api/v1/pipelines` | pipeline.view/manage | list/config; workspace scope |
| PUT | `/api/v1/pipelines/:id/stages/order` | pipeline.manage | stage ID order; atomic |
| DELETE | `/api/v1/stages/:id` | pipeline.manage | `{moveToStageId}` required if populated |
| GET/POST/PATCH | `/api/v1/field-definitions` | field.manage | metadata and type-safe dropdown options |
| GET/POST | `/api/v1/saved-views` | contact/opportunity.view | filter AST persisted and re-evaluated |
| PUT | `/api/v1/assignment/rules` | assignment.manage | availability, caps, windows and fallback validation |

## Leads
| Method | Path | Permission | Contract |
|---|---|---|---|
| POST | `/api/v1/public/forms/:workspaceSlug/leads` | public (limited) | contact input, source fixed `web_form`, optional dedupe key |
| POST | `/api/v1/leads` | lead.create | contact ID, source `manual`, optional metadata |
| GET | `/api/v1/leads?recovery=true&owner=me` | lead.view | keyset pagination and valid filters |
| GET | `/api/v1/leads/:id` | lead.view | owner + `deadlineAt`, reason codes, activity |
| POST | `/api/v1/leads/:id/acknowledge` | current owner or manager permission | `{expectedVersion}`; idempotent if already acked by same owner |
| POST | `/api/v1/leads/:id/reassign` | lead.reassign | `{ownerUserId,reason,expectedVersion}` |
| GET | `/api/v1/leads/recovery/summary` | lead.view | counts/reasons consistent with listing |

## Integrations and external data
| Method | Path | Permission | Contract |
|---|---|---|---|
| GET | `/api/v1/conversations` | conversation.view | paginated assigned inbox |
| POST | `/api/v1/conversations/:id/messages` | message.send | `{body,idempotencyKey}` → message `queued` or explicit blocked/failed |
| POST | `/api/v1/opportunities/:id/checkout` | payment.create | amount/currency -> hosted URL + payment request record |
| POST | `/api/v1/appointments` | appointment.create | contact, employee, RFC3339 start/end, timezone -> pending/confirmed |
| GET | `/api/v1/calendar/freebusy?employeeId=...` | appointment.view | busy periods; no booking if disconnected |
| PATCH/DELETE | `/api/v1/appointments/:id` | appointment.edit | reschedule/cancel with history |
| GET | `/api/v1/integrations` | integrations.manage | provider states, last worked, recent error |
| GET | `/api/v1/integrations/:provider/events` | integrations.manage | paginated sync history, sanitized |
| POST | `/api/v1/integrations/google/connect` | owner/admin with permission | OAuth initiation redirect URL generated server-side |
| POST | `/api/v1/integrations/:provider/disconnect` | integrations.manage | revoke/disconnect, audit |
| GET | `/api/v1/dashboard/overview` | dashboard.view | role-scoped metrics, drill-down filter references |
| GET | `/api/v1/audit` | audit.view | paginated, filterable read-only |

## Provider-owned endpoints (no session cookie)
`POST /api/webhooks/twilio/:publicIntegrationId/messages` (`application/x-www-form-urlencoded`, X-Twilio-Signature); `POST /api/webhooks/twilio/:publicIntegrationId/status`; `POST /api/webhooks/stripe/:publicIntegrationId` (raw JSON + Stripe-Signature); `GET /api/oauth/google/callback` (signed, one-time state). **Never apply browser session CSRF protection to provider webhooks**; authenticate them by provider signature/state, strict content type, limit and rate controls.

## Event and error shapes
```json
{"type":"lead.owner_changed","eventId":"evt_demo_1","workspaceId":"internal_server_only","occurredAt":"2026-10-18T04:00:00Z","data":{"leadId":"lead_123","version":3}}
```
```json
{"error":{"code":"MISSING_REQUIRED_STAGE_FIELDS","message":"Complete Site area before moving to Proposal.","requestId":"req_123","details":{"fields":["site_area"]}}}
```
Supabase Realtime is permission-scoped using database RLS and private/restricted channel authorization. It should emit only minimally necessary identifiers; UI re-fetches authoritative data via RLS. There is no custom `GET /v1/events` SSE endpoint. Timestamps are stored in UTC and formatted using the user’s timezone.

**Stack authority:** See `06_TECHNICAL_STACK.md`. These are behavioral API contracts for `src/app/api/v1/.../route.ts`, not a separate Express API. Any direct client DB access remains subject to Supabase RLS; provider mutation endpoints must use verified signatures. Supabase Auth manages password sessions.

# CRM, Custom Fields, Pipeline and Customer 360 Functional Specification

## Record model and tenant-specific views
- Company → many Contacts; Contact → many Opportunities/Leads/Conversations/Appointments; Opportunity → stage, dynamic fields, payments, activity.
- Default pipeline created on signup; Admin can create a second one to meet **F2.3**. Same contact record shared between pipelines but field definitions are pipeline-scoped on opportunities.
- Each opportunity has current `pipelineId/stageId`, normalized `custom_data_json` validated against pipeline field metadata; v1 metadata types: text, number, date, dropdown, checkbox.

## Dynamic fields
Admin creates `{key,label,type,required?,dropdownOptions,helpText}`. Validate unique key within pipeline, immutable key after first use, safe field names, dropdown allowed options. Render fields by type using shared form control registry. `GET /field-definitions?pipelineId=` drives both editor and detail forms. On type modification with existing values: block unsafe change or run explicit migration preview; deleting a field archives definition and hides it, preserving historical values/audit.

## Stage-specific required fields
`stage_required_fields` relates stage IDs to field definitions of same workspace + pipeline. On stage move server checks missing values: whitespace-empty string, invalid number, `null` date, empty selection; checkbox `false` counts as filled if explicitly present (unless rule says must be true). Return 422 with stable field IDs/labels. Board reverts card on rejection and opens missing-field dialog. Admin cannot remove populated stage silently.

## Pipeline operations
- Create pipeline/stage, rename, reorder via stable stage IDs; positions validated and moved transactionally.
- Delete empty stage: soft-delete; delete occupied stage: require destination *same pipeline* or deliberate cross-pipeline migrate wizard; pre-validate destination's required fields for all moved opportunities; otherwise 409 with count and blocker report.
- Movement creates stage-change activity and audit with before/after; prevent stale concurrent updates with row `version`.
- Board/list toggle; keyboard-accessible stage dropdown fallback to dragging.

## Saved filter lists
Represent as validated AST, e.g.:
```json
{"operator":"and","rules":[{"field":"stageId","op":"eq","value":"stage_1"},{"field":"ownerId","op":"eq","value":"me"},{"field":"createdAt","op":"gte","value":"2026-10-01"}]}
```
Only allow known scoped fields, approved operators, bounded depth and count; parameterize query; test three simultaneous criteria; `SavedView` stores AST, sort and columns, **not list membership**. Re-run on every navigation, so records dynamically join/leave. Permission-aware filtering prohibits querying a hidden opportunity value field even when API output is masked.

## Contact 360 record layout
Header: full name/company, phone with WhatsApp context, owner, badges; tab/sections for Opportunities, Conversation, Payments, Appointments, chronological Activity. Activity records include source, actor/system, timestamp and linkable entity. Avoid multiple copies of provider source-of-truth: message uses provider status, payments use signed provider event, appointments use provider event ID.

## Critical integrity tests
- Two pipelines, different custom fields, same contact; stage-specific required blocker on server.
- Contact deletion cannot orphan conversation/payment; soft-delete + activity history remains.
- Cross-tenant company/contact/opportunity foreign IDs rejected, including hidden fields.
- Exports honor field-level value permission and filtering authorization.
- 500+ records paginated with stable cursor and search state.

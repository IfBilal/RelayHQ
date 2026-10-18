begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('95000000-0000-0000-0000-00000000000a', 'owner@o.test',  'authenticated', 'authenticated', now()),
  ('95000000-0000-0000-0000-0000000000a1', 'user@o.test',   'authenticated', 'authenticated', now()),
  ('95000000-0000-0000-0000-00000000000b', 'owner@w.test',  'authenticated', 'authenticated', now());

select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Out Co', 'outco')$$, 'workspace A');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.create_workspace('Out Other', 'outother')$$, 'workspace B');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'outco') as ws,
  (select id from public.workspaces where slug = 'outother') as ws_b,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'outco' and r.name = 'User') as user_role;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, '95000000-0000-0000-0000-0000000000a1'::uuid, 'user', user_role from ctx;
insert into public.outbox_events (workspace_id, kind, idempotency_key, status, attempts, last_error) select ws, 'escalation_email', 'k-dead', 'dead', 4, 'smtp down' from ctx;
insert into public.outbox_events (workspace_id, kind, idempotency_key, status, attempts) select ws, 'escalation_email', 'k-sent', 'sent', 1 from ctx;
insert into public.outbox_events (workspace_id, kind, idempotency_key, status, attempts, last_error) select ws, 'escalation_email', 'k-failed', 'failed', 2, 'x' from ctx;
insert into public.outbox_events (workspace_id, kind, idempotency_key, status, attempts) select ws, 'escalation_email', 'k-pending', 'pending', 0 from ctx;
insert into public.outbox_events (workspace_id, kind, idempotency_key, status, attempts, last_error) select ws_b, 'escalation_email', 'k-foreign', 'failed', 2, 'x' from ctx;
create temp table ev as select
  (select id from public.outbox_events where idempotency_key = 'k-dead') as dead,
  (select id from public.outbox_events where idempotency_key = 'k-sent') as sent,
  (select id from public.outbox_events where idempotency_key = 'k-foreign') as foreign_ev,
  (select id from public.outbox_events where idempotency_key = 'k-failed') as failed_ev,
  (select id from public.outbox_events where idempotency_key = 'k-pending') as pending_ev;
grant select on ctx, ev to authenticated, anon;

select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select dead from ev)), '42501', null, 'a member without integrations.manage cannot retry');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select sent from ev)), 'P0002', null, 'a sent alert is not retryable');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select foreign_ev from ev)), 'P0002', null, 'another workspace''s alert is not found');
select lives_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select dead from ev)), 'a dead alert is re-queued');
reset role;
select is((select status || ':' || attempts from public.outbox_events where idempotency_key = 'k-dead'), 'pending:0', 'status pending, attempts reset');
select is((select status from public.outbox_events where idempotency_key = 'k-foreign'), 'failed', 'the foreign alert is untouched');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.audit_events where action = 'integration.alert_retried'), 1, 'the retry is audited');

-- more actors and states
select pg_temp.as_user('95000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select failed_ev from ev)), 'a failed alert is retryable');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select pending_ev from ev)), 'P0002', null, 'a pending alert is not retryable');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select dead from ev)), 'P0429', null, 'a second retry within 60 seconds is refused');
select is((select after->>'previous_status' from public.audit_events where action = 'integration.alert_retried' order by created_at limit 1), 'dead', 'audit records the previous status');
select pg_temp.as_user('95000000-0000-0000-0000-00000000000b');
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select dead from ev)), 'P0002', null, 'an outsider in another workspace cannot retry (not found)');
select pg_temp.as_user('95000000-0000-0000-0000-0000000000a1');
select is((select count(*)::int from public.outbox_events), 0, 'a member without integrations.manage sees no alerts');
select is((select count(*)::int from public.integration_events), 0, 'nor integration events');
reset role;
set local role anon;
select throws_ok(format($$select public.retry_outbox_event(%L, %L)$$, (select ws from ctx), (select dead from ev)), '42501', null, 'anon cannot retry');
reset role;

select * from finish();
rollback;

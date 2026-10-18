begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;
-- ids: O owner, U1..U3 users, M manager-preset member, B tenant-B owner
create function pg_temp.u(n text) returns uuid language sql as $$ select ('e0000000-0000-0000-0000-00000000000' || n)::uuid $$;
create function pg_temp.avail(only_users text[]) returns void language plpgsql as $$
begin -- everyone offline except the listed members, as the table owner
  update public.memberships set availability = case when user_id::text = any (select pg_temp.u(x)::text from unnest(only_users) x) then 'available' else 'offline' end
   where workspace_id = (select ws from ctx);
end $$;

insert into auth.users (id, email, aud, role)
  select pg_temp.u(n), 'u' || n || '@a.test', 'authenticated', 'authenticated' from unnest(array['0','1','2','3','4']) n;
insert into auth.users (id, email, aud, role) values ('f0000000-0000-0000-0000-00000000000b', 'owner@b.test', 'authenticated', 'authenticated');

select pg_temp.as_user(pg_temp.u('0'));
select lives_ok($$select public.create_workspace('Atlas', 'atlas')$$, 'workspace created');
reset role;
create temp table ctx as select (select id from public.workspaces where slug = 'atlas') as ws;
grant select on ctx to authenticated;
-- U1..U3 plain users, U4 manager preset
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, pg_temp.u(n), 'user', (select id from public.permission_roles where workspace_id = ctx.ws and name = case when n = '4' then 'Manager' else 'User' end)
  from ctx, unnest(array['1','2','3','4']) n;
insert into public.contacts (workspace_id, name, phone_e164)
  select ws, 'Contact ' || g, '+1555000' || lpad(g::text, 4, '0') from ctx, generate_series(1, 12) g;
create temp table contacts_t as select row_number() over (order by name) n, id from public.contacts;
grant select on contacts_t to authenticated;
create function pg_temp.c(n int) returns uuid language sql as $$ select id from contacts_t where n = $1 $$;
select is((select windows_seconds from public.assignment_rules where workspace_id = (select ws from ctx)), '{30,20,15,15}'::int[], 'workspace gets default assignment rules');
select is((select count(*)::int from cron.job where jobname = 'escalate-due-leads' and active), 1, 'escalation job is scheduled');

-- ---------------- routing
select pg_temp.avail(array['1']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'only U1 available')$$, (select ws from ctx), pg_temp.c(1)), 'manual capture');
reset role;
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(1)), pg_temp.u('1'), 'only the available employee receives leads');
select ok((select deadline_at > now() and first_assigned_at is not null from public.leads where contact_id = pg_temp.c(1)), 'deadline and first_assigned_at are persisted');

select pg_temp.avail(array['1','2','3']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'rr a')$$, (select ws from ctx), pg_temp.c(2)), 'rr 1');
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'rr b')$$, (select ws from ctx), pg_temp.c(3)), 'rr 2');
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'rr c')$$, (select ws from ctx), pg_temp.c(4)), 'rr 3');
reset role;
select is((select count(distinct owner_user_id)::int from public.leads where contact_id in (pg_temp.c(2), pg_temp.c(3), pg_temp.c(4))), 3, 'round robin spreads three leads over three employees');

-- busy / on leave never receive leads
update public.memberships set availability = 'busy' where user_id = pg_temp.u('2');
update public.memberships set availability = 'on_leave' where user_id = pg_temp.u('3');
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'x')$$, (select ws from ctx), pg_temp.c(5)), 'capture with busy/on-leave colleagues');
reset role;
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(5)), pg_temp.u('1'), 'busy and on-leave employees are skipped');

-- emergency fallback: nobody available -> workspace owner, flagged, one alert intent
select pg_temp.avail(array[]::text[]);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'nobody')$$, (select ws from ctx), pg_temp.c(6)), 'capture with nobody available');
reset role;
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(6)), pg_temp.u('0'), 'no eligible employee falls back to the Owner');
select ok((select emergency from public.leads where contact_id = pg_temp.c(6)), 'emergency flag is set');
select is((select count(*)::int from public.outbox_events where payload ->> 'reason' = 'NO_ELIGIBLE_EMPLOYEE'), 1, 'emergency assignment queues one alert');

-- capacity cap
select pg_temp.avail(array['1']);
select pg_temp.as_user(pg_temp.u('0'));
select lives_ok(format($$select public.update_assignment_rules(%L, 1, '{30,20,15,15}', 1, null, null, 900, true)$$, (select ws from ctx)), 'owner lowers the cap to 1');
reset role;
delete from public.lead_assignment_events where lead_id in (select id from public.leads where owner_user_id = pg_temp.u('1'));
delete from public.leads where owner_user_id = pg_temp.u('1');
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'cap1')$$, (select ws from ctx), pg_temp.c(7)), 'first lead fits the cap');
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'cap2')$$, (select ws from ctx), pg_temp.c(8)), 'second lead overflows');
reset role;
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(8)), pg_temp.u('0'), 'a full employee is not assigned beyond the cap');

-- ---------------- public form: dedupe, validation, throttle
select is(public.submit_public_lead('atlas', 'Web Person', 'web@example.com', null, 'quote', 'k1', 'h1'), public.submit_public_lead('atlas', 'Web Person', 'web@example.com', null, 'quote', 'k1', 'h1'), 'same dedupe key returns the same lead');
select is((select count(*)::int from public.leads where source = 'web_form'), 1, 'a duplicate delivery creates one lead');
select throws_ok($$select public.submit_public_lead('atlas', 'X', 'not-an-email', null, '', 'k2', 'h2')$$, '22023', null, 'invalid email rejected');
select throws_ok($$select public.submit_public_lead('nope-nope', 'X', 'a@b.co', null, '', 'k3', 'h3')$$, 'P0002', null, 'unknown workspace');
select lives_ok($$select public.submit_public_lead('atlas', 'Flood', 'f1@example.com', null, '', 'f1', 'flood')$$, 'flood 1');
select lives_ok($$select public.submit_public_lead('atlas', 'Flood', 'f2@example.com', null, '', 'f2', 'flood')$$, 'flood 2');
select lives_ok($$select public.submit_public_lead('atlas', 'Flood', 'f3@example.com', null, '', 'f3', 'flood')$$, 'flood 3');
select lives_ok($$select public.submit_public_lead('atlas', 'Flood', 'f4@example.com', null, '', 'f4', 'flood')$$, 'flood 4');
select lives_ok($$select public.submit_public_lead('atlas', 'Flood', 'f5@example.com', null, '', 'f5', 'flood')$$, 'flood 5');
select throws_ok($$select public.submit_public_lead('atlas', 'Flood', 'f6@example.com', null, '', 'f6', 'flood')$$, 'P0429', null, 'sixth request from one client is throttled');

-- ---------------- acknowledgement and escalation (reset to a clean slate)
reset role;
delete from public.outbox_events;
delete from public.lead_assignment_events;
delete from public.leads;
select pg_temp.as_user(pg_temp.u('0'));
select lives_ok(format($$select public.update_assignment_rules(%L, 8, '{30,20,15,15}', 1, %L, %L, 900, true)$$, (select ws from ctx), pg_temp.u('3'), pg_temp.u('4')), 'configure backup and manager');
reset role;
select pg_temp.avail(array['1','2']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'chain')$$, (select ws from ctx), pg_temp.c(9)), 'lead for the chain');
reset role;
create temp table lead_t as select id, owner_user_id as first_owner, version from public.leads where contact_id = pg_temp.c(9);
grant select on lead_t to authenticated;
select pg_temp.avail(array['1','2']);  -- both stay eligible; backup/manager are U3/U4 (offline is fine: busy/available required)
update public.memberships set availability = 'busy' where user_id in (pg_temp.u('3'), pg_temp.u('4'));

-- level 1: next eligible employee, once, with one alert
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from lead_t);
select is((select (private.escalate_due_leads(50) ->> 'escalated')::int), 1, 'expired lead escalates');
select isnt((select owner_user_id from public.leads where id = (select id from lead_t)), (select first_owner from lead_t), 'ownership moved to someone else');
select is((select escalation_count from public.leads where id = (select id from lead_t)), 1, 'escalation counted once');
select is((select (private.escalate_due_leads(50) ->> 'escalated')::int), 0, 'a second run does not escalate again');
select is((select count(*)::int from public.lead_assignment_events where lead_id = (select id from lead_t) and cause = 'timeout'), 1, 'exactly one timeout event');
select is((select count(*)::int from public.outbox_events where payload ->> 'lead_id' = (select id::text from lead_t)), 1, 'exactly one alert intent');
select ok((select job = 'escalate_due_leads' from public.job_heartbeats limit 1), 'worker heartbeat recorded');

-- levels 2..4: backup, manager, owner as emergency
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from lead_t);
select lives_ok($$select private.escalate_due_leads(50)$$, 'escalation run');
select is((select owner_user_id from public.leads where id = (select id from lead_t)), pg_temp.u('3'), 'level 2 is the designated backup');
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from lead_t);
select lives_ok($$select private.escalate_due_leads(50)$$, 'escalation run');
select is((select owner_user_id from public.leads where id = (select id from lead_t)), pg_temp.u('4'), 'level 3 is the manager');
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from lead_t);
select lives_ok($$select private.escalate_due_leads(50)$$, 'escalation run');
select is((select owner_user_id from public.leads where id = (select id from lead_t)), pg_temp.u('0'), 'chain ends at the Owner');
select ok((select emergency from public.leads where id = (select id from lead_t)), 'final level is flagged as emergency');
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from lead_t);
select lives_ok($$select private.escalate_due_leads(50)$$, 'escalation run');
select is((select owner_user_id from public.leads where id = (select id from lead_t)), pg_temp.u('0'), 'exhausted chain keeps the Owner accountable');
select is((select count(*)::int from public.outbox_events where payload ->> 'lead_id' = (select id::text from lead_t)), 4, 'no repeat email once the chain is exhausted');

-- stale owner cannot acknowledge after escalation took the lead
select pg_temp.as_user((select first_owner from lead_t));
select throws_ok(format($$select public.acknowledge_lead(%L, %L, 1)$$, (select ws from ctx), (select id from lead_t)), 'P0409', null, 'previous owner cannot take the lead back');

-- ---------------- acknowledgement semantics
reset role;
delete from public.outbox_events; delete from public.lead_assignment_events; delete from public.leads;
select pg_temp.avail(array['1']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'ack me')$$, (select ws from ctx), pg_temp.c(10)), 'lead to acknowledge');
reset role;
create temp table ack_t as select id, version from public.leads where contact_id = pg_temp.c(10);
grant select on ack_t to authenticated;
select pg_temp.as_user(pg_temp.u('2'));
select throws_ok(format($$select public.acknowledge_lead(%L, %L, %s)$$, (select ws from ctx), (select id from ack_t), (select version from ack_t)), 'P0409', null, 'a non-owner cannot acknowledge');
select is((select count(*)::int from public.leads), 0, 'a user cannot see leads owned by someone else');
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.acknowledge_lead(%L, %L, %s)$$, (select ws from ctx), (select id from ack_t), (select version from ack_t)), 'owner acknowledges');
select lives_ok(format($$select public.acknowledge_lead(%L, %L, %s)$$, (select ws from ctx), (select id from ack_t), (select version from ack_t)), 'acknowledging twice is idempotent');
reset role;
select ok((select acknowledged_at is not null and deadline_at is null and first_acknowledged_at is not null from public.leads where id = (select id from ack_t)), 'acknowledgement stops the timer and records the first response');
update public.leads set deadline_at = now() - interval '1 second' where id = (select id from ack_t);
select is((select (private.escalate_due_leads(50) ->> 'escalated')::int), 0, 'an acknowledged lead never auto-rotates');

-- a recorded action acknowledges
reset role;
select pg_temp.avail(array['1']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'act')$$, (select ws from ctx), pg_temp.c(11)), 'lead for action ack');
select lives_ok(format($$select public.add_note(%L, %L, null, 'called the customer')$$, (select ws from ctx), pg_temp.c(11)), 'owner records a note');
reset role;
select ok((select acknowledged_at is not null from public.leads where contact_id = pg_temp.c(11)), 'a note by the owner counts as acknowledgement');

-- ---------------- absence: unacknowledged leads move at once, acknowledged ones stay
select pg_temp.avail(array['1', '2']);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.capture_manual_lead(%L, %L, 'absence')$$, (select ws from ctx), pg_temp.c(12)), 'lead before absence');
reset role;
update public.leads set owner_user_id = pg_temp.u('1') where contact_id = pg_temp.c(12);
select pg_temp.as_user(pg_temp.u('1'));
select lives_ok(format($$select public.set_member_availability(%L, %L, 'on_leave')$$, (select ws from ctx), pg_temp.u('1')), 'owner goes on leave');
reset role;
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(12)), pg_temp.u('2'), 'unacknowledged lead moved immediately');
select is((select owner_user_id from public.leads where contact_id = pg_temp.c(11)), pg_temp.u('1'), 'acknowledged lead stays with its owner');
select is((select escalation_count from public.leads where contact_id = pg_temp.c(12)), 0, 'an absence reassignment is not counted as an escalation');
select ok((select count(*) from public.lead_assignment_events where cause = 'absence') = 1, 'absence reassignment is recorded');

-- ---------------- recovery queue visibility
update public.leads set deadline_at = now() - interval '5 seconds', acknowledged_at = null where contact_id = pg_temp.c(12);
select pg_temp.as_user(pg_temp.u('4'));
select ok((select 'PAST_DUE_UNACKNOWLEDGED' = any (reasons) from public.recovery_queue((select ws from ctx)) where lead_id = (select id from public.leads where contact_id = pg_temp.c(12))), 'manager sees past-due leads with the reason');
select pg_temp.as_user(pg_temp.u('3'));
select is((select count(*)::int from public.recovery_queue((select ws from ctx))), 0, 'a user only sees their own leads in the recovery queue');

-- ---------------- RLS and direct writes
select pg_temp.as_user(pg_temp.u('1'));
select throws_ok($$update public.leads set owner_user_id = (select pg_temp.u('1'))$$, '42501', null, 'owner_id is not client-writable');
select throws_ok($$insert into public.outbox_events (workspace_id, kind, idempotency_key) values ((select ws from ctx), 'x', 'x')$$, '42501', null, 'outbox is not client-writable');
select throws_ok($$select * from public.claim_outbox(5, 30)$$, '42501', null, 'outbox dispatch is not callable by users');
select pg_temp.as_user('f0000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.create_workspace('Beacon', 'beacon')$$, 'tenant B workspace');
select is((select count(*)::int from public.leads), 0, 'tenant B sees no leads of A');
select throws_ok(format($$select public.acknowledge_lead(%L, %L, 1)$$, (select ws from ctx), (select id from ack_t)), 'P0002', null, 'tenant B gets not found for A leads');
reset role; set local role anon;
select throws_ok($$select * from public.leads$$, '42501', null, 'anon cannot read leads');
select throws_ok($$select public.capture_manual_lead(gen_random_uuid(), gen_random_uuid(), 'x')$$, '42501', null, 'anon cannot capture manual leads');

-- ---------------- disabling a member releases their leads
reset role;
select pg_temp.avail(array['2']);
select pg_temp.as_user(pg_temp.u('0'));
select lives_ok(format($$select public.change_member_access(%L, %L, 'user', (select permission_role_id from public.memberships where user_id = %L and workspace_id = %L), false)$$, (select ws from ctx), pg_temp.u('1'), pg_temp.u('1'), (select ws from ctx)), 'owner disables U1');
reset role;
select is((select count(*)::int from public.leads where owner_user_id = pg_temp.u('1') and status = 'open'), 0, 'a disabled member keeps no open leads');

select * from finish();
rollback;

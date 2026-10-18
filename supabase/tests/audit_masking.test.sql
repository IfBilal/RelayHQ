begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role) values
  ('e0000000-0000-0000-0000-00000000000a', 'owner@m.test', 'authenticated', 'authenticated'),
  ('e0000000-0000-0000-0000-0000000000a1', 'viewer@m.test', 'authenticated', 'authenticated');

select pg_temp.as_user('e0000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Mask Co', 'maskco')$$, 'workspace created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'maskco') as ws,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'maskco' and r.name = 'User') as user_role,
  (select p.id from public.pipelines p join public.workspaces w on w.id = p.workspace_id where w.slug = 'maskco') as pl;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, 'e0000000-0000-0000-0000-0000000000a1', 'user', user_role from ctx;
grant select on ctx to authenticated;

-- owner gives the User role audit.view but not opportunity.value.view
select pg_temp.as_user('e0000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['audit.view','crm.view','crm.edit'])$$, (select ws from ctx), (select user_role from ctx)), 'grant audit.view only');
reset role;
insert into public.contacts (workspace_id, name, phone_e164) select ws, 'Mask Contact', '+15550009999' from ctx;
insert into public.opportunities (workspace_id, pipeline_id, stage_id, contact_id, title)
  select c.ws, c.pl, (select id from public.stages where pipeline_id = c.pl order by position limit 1), (select id from public.contacts where name = 'Mask Contact'), 'Mask Opp' from ctx c;
create temp table opp as select id from public.opportunities where title = 'Mask Opp';
grant select on opp to authenticated;

select pg_temp.as_user('e0000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_opportunity_value(%L, %L, 123456789)$$, (select ws from ctx), (select id from opp)), 'owner sets value');
select lives_ok(format($$select public.set_opportunity_value(%L, %L, 987654321)$$, (select ws from ctx), (select id from opp)), 'owner changes value');

select pg_temp.as_user('e0000000-0000-0000-0000-0000000000a1');
select ok((select count(*) from public.audit_events where action = 'opportunity.value_changed') = 2, 'viewer sees the value-change events');
select is((select count(*)::int from public.audit_events where before::text ~ '(123456789|987654321|value_minor)' or after::text ~ '(123456789|987654321|value_minor)' or entity_id ~ '(123456789|987654321)'), 0, 'no amount anywhere in the audit read path');
select is((select after from public.audit_events where action = 'opportunity.value_changed' limit 1), '{"changed": true}'::jsonb, 'only changed:true logged');
select throws_ok(format($$select public.opportunity_values(%L, array[%L]::uuid[])$$, (select ws from ctx), (select id from opp)), '42501', null, 'viewer cannot read values via the value path');

-- append-only still enforced after the migration
select throws_ok($$update public.audit_events set action = 'x'$$, '42501', null, 'audit update still blocked');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'audit delete still blocked');
reset role;
select throws_ok($$update public.audit_events set action = 'x'$$, '42501', null, 'audit update blocked even for privileged role');
select is((select tgenabled::text from pg_trigger where tgrelid = 'public.audit_events'::regclass and tgname = 'audit_events_no_update'), 'O', 'append-only trigger enabled');

select * from finish();
rollback;

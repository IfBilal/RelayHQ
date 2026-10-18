begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role) values
  ('c0000000-0000-0000-0000-00000000000a', 'owner@a.test', 'authenticated', 'authenticated'),
  ('c0000000-0000-0000-0000-0000000000a1', 'user@a.test',  'authenticated', 'authenticated'),
  ('d0000000-0000-0000-0000-00000000000b', 'owner@b.test', 'authenticated', 'authenticated');

-- tenant A: Owner creates the workspace, a User-preset member joins
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Atlas', 'atlas')$$, 'workspace A created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'atlas') as ws,
  (select p.id from public.pipelines p join public.workspaces w on w.id = p.workspace_id where w.slug = 'atlas') as pl,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'atlas' and r.name = 'User') as user_role;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, 'c0000000-0000-0000-0000-0000000000a1', 'user', user_role from ctx;
grant select on ctx to authenticated;

-- tenant B
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.create_workspace('Beacon', 'beacon')$$, 'workspace B created');
reset role;
create temp table ctx_b as select (select id from public.workspaces where slug = 'beacon') as ws;
insert into public.contacts (workspace_id, name, phone_e164) select ws, 'Foreign Contact', '+15550000001' from ctx_b;
create temp table ctx_b2 as select (select id from public.contacts where name = 'Foreign Contact') as contact;
grant select on ctx_b, ctx_b2 to authenticated;

select is((select count(*)::int from public.stages where pipeline_id = (select pl from ctx)), 6, 'default pipeline has six stages');

-- ---------------- contacts under RLS
select pg_temp.as_user('c0000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$insert into public.contacts (workspace_id, name, phone_e164) values (%L, 'Maya Richardson', '+14155550184')$$, (select ws from ctx)), 'user creates a contact');
select throws_ok(format($$insert into public.contacts (workspace_id, name, phone_e164) values (%L, 'Maya Again', '+14155550184')$$, (select ws from ctx)), '23505', null, 'duplicate phone rejected');
select throws_ok(format($$insert into public.contacts (workspace_id, name, phone_e164) values (%L, 'Bad Phone', '0415')$$, (select ws from ctx)), '23514', null, 'non E.164 phone rejected');
select throws_ok(format($$insert into public.contacts (workspace_id, name) values (%L, 'Sneaky')$$, (select ws from ctx_b)), '42501', null, 'cannot insert into another workspace');
select throws_ok($$update public.contacts set workspace_id = (select ws from ctx_b)$$, '42501', null, 'workspace_id is not client-writable');
select lives_ok($$update public.contacts set name = 'Maya R.' where name = 'Maya Richardson'$$, 'user edits a contact');
select is((select version from public.contacts where name = 'Maya R.'), 2, 'version increments on update');
select throws_ok($$update public.contacts set archived_at = now() where name = 'Maya R.'$$, '42501', null, 'archiving needs crm.delete');
select is((select count(*)::int from public.contacts where name = 'Foreign Contact'), 0, 'other workspace contacts invisible');

create temp table ids as select
  (select id from public.contacts where name = 'Maya R.') as contact,
  (select id from public.stages where pipeline_id = (select pl from ctx) and name = 'New inquiry') as s_new,
  (select id from public.stages where pipeline_id = (select pl from ctx) and name = 'Proposal sent') as s_prop,
  (select id from public.stages where pipeline_id = (select pl from ctx) and name = 'Qualified') as s_qual;
grant select on ids to authenticated;

-- ---------------- opportunities and money
select throws_ok(format($$select public.create_opportunity(%L, %L, %L, %L, 'Solar', 'USD', 500000, null, '{}')$$, (select ws from ctx), (select contact from ids), (select pl from ctx), (select s_new from ids)),
  '42501', null, 'user without value permission cannot set a value');
select lives_ok(format($$select public.create_opportunity(%L, %L, %L, %L, 'Solar install', 'USD', null, null, '{}')$$, (select ws from ctx), (select contact from ids), (select pl from ctx), (select s_new from ids)), 'user creates an opportunity without value');
select throws_ok(format($$select public.create_opportunity(%L, %L, %L, %L, 'Cross tenant', 'USD', null, null, '{}')$$, (select ws from ctx), (select contact from ctx_b2), (select pl from ctx), (select s_new from ids)),
  '23503', null, 'foreign contact id fails the composite FK');
select throws_ok($$select * from private.opportunity_financials$$, '42501', null, 'financials table is not readable');
select throws_ok(format($$select * from public.opportunity_values(%L, array[gen_random_uuid()])$$, (select ws from ctx)), '42501', null, 'values function denies users without permission');

reset role;
create temp table opp as select id, version from public.opportunities where title = 'Solar install';
grant select on opp to authenticated;
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_opportunity_value(%L, %L, 750000)$$, (select ws from ctx), (select id from opp)), 'owner sets value');
select is((select value_minor from public.opportunity_values((select ws from ctx), array[(select id from opp)])), 750000::bigint, 'owner reads value through the function');
select is((select open_value_minor from public.pipeline_value_by_stage((select ws from ctx), (select pl from ctx)) where stage_id = (select s_new from ids)), 750000::bigint, 'stage aggregate sums values for permitted users');

-- ---------------- custom fields, required fields, stage moves
create temp table fld as select public.create_field_definition((select ws from ctx), (select pl from ctx), 'site_area', 'Site area', 'number', '[]', null) as id;
grant select on fld to authenticated;
select throws_ok(format($$select public.create_field_definition(%L, %L, 'site_area', 'Dup', 'text', '[]', null)$$, (select ws from ctx), (select pl from ctx)), '23505', null, 'duplicate field key in a pipeline rejected');
select lives_ok(format($$select public.set_stage_required_fields(%L, %L, array[%L]::uuid[])$$, (select ws from ctx), (select s_prop from ids), (select id from fld)), 'owner makes site_area required for Proposal');

select pg_temp.as_user('c0000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.move_opportunity_stage(%L, %L, %L, 1)$$, (select ws from ctx), (select id from opp), (select s_prop from ids)), 'P0422', null, 'move blocked while required field is empty');
select throws_ok(format($$select public.set_opportunity_custom_values(%L, %L, '{"site_area":"abc"}', 1)$$, (select ws from ctx), (select id from opp)), '22023', null, 'wrong value type rejected');
select throws_ok(format($$select public.set_opportunity_custom_values(%L, %L, '{"nope":1}', 1)$$, (select ws from ctx), (select id from opp)), '22023', null, 'unknown field rejected');
select lives_ok(format($$select public.set_opportunity_custom_values(%L, %L, '{"site_area":120}', 1)$$, (select ws from ctx), (select id from opp)), 'fill the field');
select throws_ok(format($$select public.move_opportunity_stage(%L, %L, %L, 1)$$, (select ws from ctx), (select id from opp), (select s_prop from ids)), 'P0409', null, 'stale version is a conflict');
select lives_ok(format($$select public.move_opportunity_stage(%L, %L, %L, 2)$$, (select ws from ctx), (select id from opp), (select s_prop from ids)), 'move succeeds once required fields are filled');
select is((select count(*)::int from public.activity_events where kind = 'stage_change'), 1, 'stage change is on the timeline');
select throws_ok(format($$select public.add_stage(%L, %L, 'Nope')$$, (select ws from ctx), (select pl from ctx)), '42501', null, 'user cannot manage pipelines');

-- ---------------- stage deletion and ordering
select pg_temp.as_user('c0000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select s_prop from ids)), 'P0409', null, 'populated stage cannot be deleted without a destination');
select lives_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select s_new from ids)), 'empty stage deletes without a destination');
select lives_ok(format($$select public.delete_stage(%L, %L, %L)$$, (select ws from ctx), (select s_prop from ids), (select s_qual from ids)), 'moving to a stage without requirements succeeds');
select is((select stage_id from public.opportunities where id = (select id from opp)), (select s_qual from ids), 'opportunity followed the move');
select lives_ok(format($$select public.add_stage(%L, %L, 'Site visit')$$, (select ws from ctx), (select pl from ctx)), 'owner adds a stage');
select is((select terminal_type from public.stages where pipeline_id = (select pl from ctx) and archived_at is null order by position desc limit 1), 'lost', 'new stages land before the terminal stages');

-- ---------------- tenant B cannot reach A, anon cannot reach anything
select pg_temp.as_user('d0000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.opportunities), 0, 'tenant B sees no opportunities of A');
select throws_ok(format($$select public.move_opportunity_stage(%L, %L, %L, 1)$$, (select ws from ctx), (select id from opp), (select s_qual from ids)), 'P0002', null, 'non-member gets not found, not forbidden');
reset role; set local role anon;
select throws_ok($$select * from public.contacts$$, '42501', null, 'anon cannot read contacts');
select throws_ok($$select * from public.opportunities$$, '42501', null, 'anon cannot read opportunities');

select * from finish();
rollback;

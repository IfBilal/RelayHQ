begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('92000000-0000-0000-0000-00000000000a', 'owner@s.test',  'authenticated', 'authenticated', now()),
  ('92000000-0000-0000-0000-0000000000a1', 'member@s.test', 'authenticated', 'authenticated', now()),
  ('92000000-0000-0000-0000-00000000000b', 'owner@z.test',  'authenticated', 'authenticated', now());

select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Stage Co', 'stageco')$$, 'workspace A');
select pg_temp.as_user('92000000-0000-0000-0000-00000000000b');
select lives_ok($$select public.create_workspace('Other Co', 'otherco')$$, 'workspace B');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'stageco') as ws,
  (select p.id from public.pipelines p join public.workspaces w on w.id = p.workspace_id where w.slug = 'stageco') as pl,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'stageco' and r.name = 'User') as user_role,
  (select s.id from public.stages s join public.pipelines p on p.id = s.pipeline_id join public.workspaces w on w.id = p.workspace_id where w.slug = 'otherco' order by s.position limit 1) as foreign_stage;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, '92000000-0000-0000-0000-0000000000a1'::uuid, 'user', user_role from ctx;
insert into public.contacts (workspace_id, name) select ws, 'Stage Contact' from ctx;
grant select on ctx to authenticated;

-- collision: add, delete, add, delete at the same slot must not fail
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.add_stage(%L, %L, 'Temp A')$$, (select ws from ctx), (select pl from ctx)), 'add Temp A');
reset role;
create temp table a as select id from public.stages where name = 'Temp A';
grant select on a to authenticated;
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select id from a)), 'delete Temp A');
select lives_ok(format($$select public.add_stage(%L, %L, 'Temp B')$$, (select ws from ctx), (select pl from ctx)), 'add Temp B at the freed slot');
reset role;
create temp table b as select id from public.stages where name = 'Temp B';
grant select on b to authenticated;
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select id from b)), 'delete Temp B (second delete at the same slot)');

-- an archived stage is not available for new opportunities
select throws_ok(format($$select public.create_opportunity(%L, (select id from public.contacts where name = 'Stage Contact'), %L, %L, 'x', 'USD', null, null, '{}')$$, (select ws from ctx), (select pl from ctx), (select id from b)), '22023', null, 'cannot create an opportunity in a deleted stage');

-- reorder: Won/Lost must stay last
reset role;
create temp table order_bad as select array_agg(id order by (terminal_type is null), position) as ids from public.stages where pipeline_id = (select pl from ctx) and archived_at is null;
grant select on order_bad to authenticated;
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.reorder_stages(%L, %L, %L::uuid[])$$, (select ws from ctx), (select pl from ctx), (select ids from order_bad)), '22023', null, 'closed stages cannot move before open ones');

-- structural guards
reset role;
create temp table sg as select
  (select id from public.stages where pipeline_id = (select pl from ctx) and terminal_type = 'won' and archived_at is null) as won,
  (select id from public.stages where pipeline_id = (select pl from ctx) and terminal_type is null and archived_at is null order by position limit 1) as first_open;
grant select on sg to authenticated;
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select won from sg)), 'P0409', null, 'cannot delete the only Won stage');
do $$
declare s record; w uuid := (select ws from ctx); begin
  -- delete open stages until one is left; the last must be refused
  for s in select id from public.stages where pipeline_id = (select pl from ctx) and terminal_type is null and archived_at is null order by position offset 1 loop
    perform public.delete_stage(w, s.id, null);
  end loop;
end $$;
select throws_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select first_open from sg)), 'P0409', null, 'cannot delete the last open stage');

-- permissions and tenant isolation
select pg_temp.as_user('92000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select first_open from sg)), '42501', null, 'member without pipeline.manage is forbidden');
select pg_temp.as_user('92000000-0000-0000-0000-00000000000a');
select throws_ok(format($$select public.delete_stage(%L, %L, null)$$, (select ws from ctx), (select foreign_stage from ctx)), 'P0002', null, 'a stage of another workspace is not found');
select throws_ok(format($$select public.rename_stage(%L, %L, 'hijack')$$, (select ws from ctx), (select foreign_stage from ctx)), 'P0002', null, 'cannot rename a foreign stage');

select * from finish();
rollback;

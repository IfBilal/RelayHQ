begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('91000000-0000-0000-0000-00000000000a', 'owner@t.test',   'authenticated', 'authenticated', now()),
  ('91000000-0000-0000-0000-0000000000a1', 'manager@t.test', 'authenticated', 'authenticated', now()),
  ('91000000-0000-0000-0000-0000000000a2', 'broad@t.test',   'authenticated', 'authenticated', now());

select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Tgt Co', 'tgtco')$$, 'workspace created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'tgtco') as ws,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'tgtco' and r.name = 'User') as user_role,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'tgtco' and r.name = 'Manager') as mgr_role;
insert into public.permission_roles (workspace_id, name) select ws, 'Broad' from ctx;
insert into public.role_grants (workspace_id, role_id, permission)
  select c.ws, r.id, p from ctx c, public.permission_roles r, unnest(array['crm.view','audit.view','role.manage']) p where r.workspace_id = c.ws and r.name = 'Broad';
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, '91000000-0000-0000-0000-0000000000a1'::uuid, 'user', mgr_role from ctx
  union all select c.ws, '91000000-0000-0000-0000-0000000000a2'::uuid, 'user', r.id from ctx c join public.permission_roles r on r.workspace_id = c.ws and r.name = 'Broad';
grant select on ctx to authenticated;

select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['role.manage','crm.view'])$$, (select ws from ctx), (select mgr_role from ctx)), 'manager role is narrow');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select user_role from ctx)), 'user role is narrow');

select pg_temp.as_user('91000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.change_member_access(%L, '91000000-0000-0000-0000-0000000000a2', 'user', %L, true)$$, (select ws from ctx), (select user_role from ctx)), '42501', null, 'cannot demote a member whose current role is broader');
select throws_ok(format($$select public.change_member_access(%L, '91000000-0000-0000-0000-0000000000a2', 'user', %L, false)$$, (select ws from ctx), (select mgr_role from ctx)), '42501', null, 'cannot lock out a broader member');

select pg_temp.as_user('91000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.change_member_access(%L, '91000000-0000-0000-0000-0000000000a2', 'user', %L, true)$$, (select ws from ctx), (select user_role from ctx)), 'Owner can change anyone');

select * from finish();
rollback;

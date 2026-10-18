begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role) values
  ('f0000000-0000-0000-0000-00000000000a', 'owner@i.test', 'authenticated', 'authenticated'),
  ('f0000000-0000-0000-0000-0000000000a1', 'inviter@i.test', 'authenticated', 'authenticated');

select pg_temp.as_user('f0000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Invite Co', 'inviteco')$$, 'workspace created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'inviteco') as ws,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'inviteco' and r.name = 'User') as user_role,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'inviteco' and r.name = 'Manager') as mgr_role;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, 'f0000000-0000-0000-0000-0000000000a1', 'user', user_role from ctx;
grant select on ctx to authenticated;

-- the inviter's role holds team.invite + crm.view only; the Manager role holds much more
select pg_temp.as_user('f0000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['team.invite','crm.view'])$$, (select ws from ctx), (select user_role from ctx)), 'User role = team.invite + crm.view');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['team.invite','crm.view','role.manage','audit.view'])$$, (select ws from ctx), (select mgr_role from ctx)), 'Manager role is broader');

select pg_temp.as_user('f0000000-0000-0000-0000-0000000000a1');
select lives_ok(format($$select public.invite_member(%L, 'same@x.test', 'user', %L, %L)$$, (select ws from ctx), (select user_role from ctx), repeat('a', 64)), 'inviter can invite into a role no broader than their own');
select throws_ok(format($$select public.invite_member(%L, 'esc@x.test', 'user', %L, %L)$$, (select ws from ctx), (select mgr_role from ctx), repeat('b', 64)), '42501', null, 'inviter cannot invite into a broader role');

select pg_temp.as_user('f0000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.invite_member(%L, 'owner-ok@x.test', 'user', %L, %L)$$, (select ws from ctx), (select mgr_role from ctx), repeat('c', 64)), 'Owner can invite into any role');

select * from finish();
rollback;

begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('90000000-0000-0000-0000-00000000000a', 'owner@c.test',   'authenticated', 'authenticated', now()),
  ('90000000-0000-0000-0000-0000000000a1', 'manager@c.test', 'authenticated', 'authenticated', now()),
  ('90000000-0000-0000-0000-0000000000a2', 'target@c.test',  'authenticated', 'authenticated', now()),
  ('90000000-0000-0000-0000-0000000000a3', 'admin@c.test',   'authenticated', 'authenticated', now()),
  ('90000000-0000-0000-0000-0000000000b1', 'unverified@c.test', 'authenticated', 'authenticated', null),
  ('90000000-0000-0000-0000-0000000000b2', 'verified@c.test',   'authenticated', 'authenticated', now());

select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Ceil Co', 'ceilco')$$, 'workspace created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'ceilco') as ws,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'ceilco' and r.name = 'User') as user_role,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'ceilco' and r.name = 'Manager') as mgr_role,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'ceilco' and r.name = 'Admin') as admin_role;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select ws, '90000000-0000-0000-0000-0000000000a1'::uuid, 'user', mgr_role from ctx
  union all select ws, '90000000-0000-0000-0000-0000000000a2'::uuid, 'user', user_role from ctx
  union all select ws, '90000000-0000-0000-0000-0000000000a3'::uuid, 'admin', admin_role from ctx;
grant select on ctx to authenticated;

-- Owner: Manager role = role.manage + team.invite + crm.view (narrow); User role = crm.view
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['role.manage','team.invite','crm.view'])$$, (select ws from ctx), (select mgr_role from ctx)), 'owner narrows Manager role');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select user_role from ctx)), 'owner sets User role');

-- Manager (role.manage holder, not Owner)
select pg_temp.as_user('90000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.set_role_permissions(%L, %L, array['role.manage','team.invite','crm.view','audit.view'])$$, (select ws from ctx), (select mgr_role from ctx)), '42501', null, 'cannot add a permission they lack to their own role');
select throws_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select admin_role from ctx)), '42501', null, 'cannot edit a broader role (Admin)');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select user_role from ctx)), 'can edit a role within their own permissions');
select throws_ok(format($$select public.change_member_access(%L, '90000000-0000-0000-0000-0000000000a2', 'user', %L, true)$$, (select ws from ctx), (select admin_role from ctx)), '42501', null, 'cannot assign a broader role');
select lives_ok(format($$select public.change_member_access(%L, '90000000-0000-0000-0000-0000000000a2', 'user', %L, true)$$, (select ws from ctx), (select user_role from ctx)), 'can assign a role within their permissions');
select throws_ok(format($$select public.change_member_access(%L, '90000000-0000-0000-0000-0000000000a3', 'admin', %L, false)$$, (select ws from ctx), (select user_role from ctx)), '42501', null, 'cannot disable or change an Admin');

-- Owner can still manage the Admin
select pg_temp.as_user('90000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.change_member_access(%L, '90000000-0000-0000-0000-0000000000a3', 'admin', %L, true)$$, (select ws from ctx), (select admin_role from ctx)), 'Owner can modify an Admin');

-- invitations: only a verified email can redeem
select lives_ok(format($$select public.invite_member(%L, 'unverified@c.test', 'user', %L, encode(extensions.digest('tok-unverified', 'sha256'), 'hex'))$$, (select ws from ctx), (select user_role from ctx)), 'invite unverified address');
select lives_ok(format($$select public.invite_member(%L, 'verified@c.test', 'user', %L, encode(extensions.digest('tok-verified', 'sha256'), 'hex'))$$, (select ws from ctx), (select user_role from ctx)), 'invite verified address');

select pg_temp.as_user('90000000-0000-0000-0000-0000000000b1');
select throws_ok($$select public.accept_invitation('tok-unverified')$$, 'P0002', null, 'unverified email cannot redeem');
select pg_temp.as_user('90000000-0000-0000-0000-0000000000b2');
select throws_ok($$select public.accept_invitation('tok-unverified')$$, 'P0002', null, 'wrong account cannot redeem someone else''s token');
select lives_ok($$select public.accept_invitation('tok-verified')$$, 'verified matching email redeems');
select throws_ok($$select public.accept_invitation('tok-verified')$$, 'P0002', null, 'token is single use');

select * from finish();
rollback;

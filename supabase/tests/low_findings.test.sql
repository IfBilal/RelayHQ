begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

create function pg_temp.as_user(u uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', u, 'role', 'authenticated')::text, true);
  execute 'set local role authenticated';
end $$;

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('93000000-0000-0000-0000-00000000000a', 'owner@l.test',  'authenticated', 'authenticated', now()),
  ('93000000-0000-0000-0000-0000000000a1', 'super@l.test',  'authenticated', 'authenticated', now()),
  ('93000000-0000-0000-0000-0000000000a2', 'admin@l.test',  'authenticated', 'authenticated', now()),
  ('93000000-0000-0000-0000-0000000000a3', 'plain@l.test',  'authenticated', 'authenticated', now());

select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok($$select public.create_workspace('Low Co', 'lowco')$$, 'workspace created');
reset role;
create temp table ctx as select
  (select id from public.workspaces where slug = 'lowco') as ws,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'lowco' and r.name = 'User') as user_role,
  (select r.id from public.permission_roles r join public.workspaces w on w.id = r.workspace_id where w.slug = 'lowco' and r.name = 'Admin') as admin_role;
-- a non-preset role with every permission, held by a base-level user ("super"), and one held by an Admin-level member
insert into public.permission_roles (workspace_id, name) select ws, 'Super' from ctx;
insert into public.permission_roles (workspace_id, name) select ws, 'HeldByAdmin' from ctx;
insert into public.role_grants (workspace_id, role_id, permission)
  select c.ws, r.id, p.key from ctx c join public.permission_roles r on r.workspace_id = c.ws and r.name in ('Super', 'HeldByAdmin') cross join public.permissions p;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select c.ws, '93000000-0000-0000-0000-0000000000a1'::uuid, 'user', (select id from public.permission_roles where workspace_id = c.ws and name = 'Super') from ctx c
  union all select c.ws, '93000000-0000-0000-0000-0000000000a2'::uuid, 'admin', (select id from public.permission_roles where workspace_id = c.ws and name = 'HeldByAdmin') from ctx c
  union all select c.ws, '93000000-0000-0000-0000-0000000000a3'::uuid, 'user', user_role from ctx c;
create temp table roles as select
  (select id from public.permission_roles where workspace_id = (select ws from ctx) and name = 'HeldByAdmin') as held_by_admin;
grant select on ctx, roles to authenticated;

-- 1. admin guard: a non-Owner with every permission still cannot edit the Admin preset or an Admin-held role
select pg_temp.as_user('93000000-0000-0000-0000-0000000000a1');
select throws_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select admin_role from ctx)), '42501', null, 'non-Owner cannot edit the Admin preset');
select throws_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select held_by_admin from roles)), '42501', null, 'non-Owner cannot edit a role held by an Admin');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view'])$$, (select ws from ctx), (select user_role from ctx)), 'non-Owner can still edit an ordinary role');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['crm.view','audit.view'])$$, (select ws from ctx), (select admin_role from ctx)), 'Owner can edit the Admin preset');

-- 2. invitations: replace expired, refuse live duplicate and existing member, revoke
select lives_ok(format($$select public.invite_member(%L, 'new@l.test', 'user', %L, repeat('1', 64))$$, (select ws from ctx), (select user_role from ctx)), 'invite new address');
select throws_ok(format($$select public.invite_member(%L, 'new@l.test', 'user', %L, repeat('2', 64))$$, (select ws from ctx), (select user_role from ctx)), '23505', null, 'live pending invite blocks a duplicate');
reset role;
update public.invitations set expires_at = now() - interval '1 day' where email = 'new@l.test';
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.invite_member(%L, 'new@l.test', 'user', %L, repeat('3', 64))$$, (select ws from ctx), (select user_role from ctx)), 'expired invite is replaced');
select is((select count(*)::int from public.invitations where email = 'new@l.test'), 1, 'exactly one pending invite for the address');
select throws_ok(format($$select public.invite_member(%L, 'plain@l.test', 'user', %L, repeat('4', 64))$$, (select ws from ctx), (select user_role from ctx)), '23505', null, 'inviting an existing member is refused');

reset role;
create temp table inv as select id from public.invitations where email = 'new@l.test';
grant select on inv to authenticated;
select pg_temp.as_user('93000000-0000-0000-0000-0000000000a3');
select throws_ok(format($$select public.revoke_invitation(%L, %L)$$, (select ws from ctx), (select id from inv)), '42501', null, 'member without team.invite cannot revoke');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.revoke_invitation(%L, %L)$$, (select ws from ctx), (select id from inv)), 'Owner revokes a pending invite');
select throws_ok(format($$select public.revoke_invitation(%L, %L)$$, (select ws from ctx), (select id from inv)), 'P0002', null, 'revoking twice is not found');

-- 3. notification email
select pg_temp.as_user('93000000-0000-0000-0000-0000000000a3');
select throws_ok($$update public.profiles set notification_email = 'attacker@evil.test' where id = '93000000-0000-0000-0000-0000000000a3'$$, '42501', null, 'direct column update is no longer granted');
select throws_ok($$select public.set_notification_email('not-an-email')$$, '22023', null, 'invalid address rejected');
select lives_ok($$select public.set_notification_email('Alice@Example.com')$$, 'valid address stored');
select is((select notification_email from public.profiles where id = '93000000-0000-0000-0000-0000000000a3'), 'alice@example.com', 'normalised to lower case');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.audit_events where action = 'profile.notification_email_changed' and after::text like '%example.com%' and after::text not like '%alice%'), 1, 'audited with the domain only');

-- 4. revoke ceiling: an inviter cannot revoke an invitation into a role broader than their own
reset role;
insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('93000000-0000-0000-0000-0000000000a4', 'inviter@l.test', 'authenticated', 'authenticated', now());
insert into public.permission_roles (workspace_id, name) select ws, 'Narrow' from ctx;
insert into public.role_grants (workspace_id, role_id, permission)
  select c.ws, r.id, p from ctx c join public.permission_roles r on r.workspace_id = c.ws and r.name = 'Narrow', unnest(array['team.invite','crm.view']) p;
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  select c.ws, '93000000-0000-0000-0000-0000000000a4'::uuid, 'user', (select id from public.permission_roles where workspace_id = c.ws and name = 'Narrow') from ctx c;
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.invite_member(%L, 'broad@l.test', 'user', %L, repeat('5', 64))$$, (select ws from ctx), (select held_by_admin from roles)), 'Owner invites into a broad role');
reset role;
create temp table inv2 as select id from public.invitations where email = 'broad@l.test';
grant select on inv2 to authenticated;
select pg_temp.as_user('93000000-0000-0000-0000-0000000000a4');
select throws_ok(format($$select public.revoke_invitation(%L, %L)$$, (select ws from ctx), (select id from inv2)), '42501', null, 'narrow inviter cannot revoke an invitation into a broader role');
select pg_temp.as_user('93000000-0000-0000-0000-00000000000a');
select lives_ok(format($$select public.revoke_invitation(%L, %L)$$, (select ws from ctx), (select id from inv2)), 'Owner can');

select * from finish();
rollback;

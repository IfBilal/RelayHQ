begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- fixtures: tenant A (owner, admin, user), tenant B (owner)
insert into auth.users (id, email, aud, role) values
  ('a0000000-0000-0000-0000-00000000000a', 'owner@a.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000ad', 'admin@a.test', 'authenticated', 'authenticated'),
  ('a0000000-0000-0000-0000-0000000000a1', 'user@a.test',  'authenticated', 'authenticated'),
  ('b0000000-0000-0000-0000-00000000000b', 'owner@b.test', 'authenticated', 'authenticated');

-- ---- tenant A owner bootstraps the workspace
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok($$select public.create_workspace('Atlas Solar', 'atlas')$$, 'owner creates workspace');
select is((select count(*)::int from public.workspaces), 1, 'owner sees exactly their workspace');
select is((select base_role from public.memberships), 'owner', 'creator is Owner');

create temp table ctx as select
  (select id from public.workspaces where slug = 'atlas') as ws,
  (select id from public.permission_roles where name = 'Admin') as admin_role,
  (select id from public.permission_roles where name = 'User') as user_role;
grant select on ctx to authenticated;

select lives_ok(format($$select public.invite_member(%L, 'admin@a.test', 'admin', %L, encode(extensions.digest('tok-admin','sha256'),'hex'))$$,
  (select ws from ctx), (select admin_role from ctx)), 'owner invites an Admin');
select lives_ok(format($$select public.invite_member(%L, 'user@a.test', 'user', %L, encode(extensions.digest('tok-user','sha256'),'hex'))$$,
  (select ws from ctx), (select user_role from ctx)), 'owner invites a User');
select ok((select count(*) from public.audit_events where workspace_id = (select ws from ctx)) >= 3, 'owner can read audit log');

-- ---- invitees accept
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
select throws_ok($$select public.accept_invitation('tok-user')$$, 'P0002', null, 'invitation is bound to the invited email');
select lives_ok($$select public.accept_invitation('tok-admin')$$, 'admin accepts their invitation');
select throws_ok($$select public.accept_invitation('tok-admin')$$, 'P0002', null, 'invitation is single-use');

reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select lives_ok($$select public.accept_invitation('tok-user')$$, 'user accepts their invitation');

-- ---- tenant B owner
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"b0000000-0000-0000-0000-00000000000b","role":"authenticated"}', true);
select throws_ok($$select public.create_workspace('Beacon', 'atlas')$$, '23505', null, 'slug is unique');
select lives_ok($$select public.create_workspace('Beacon Realty', 'beacon')$$, 'tenant B workspace');
create temp table ctx_b as select id as ws from public.workspaces where slug = 'beacon';
grant select on ctx_b to authenticated;

-- ---- isolation: tenant A user cannot see tenant B (guessed ids included)
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is((select count(*)::int from public.workspaces), 1, 'user sees only own workspace');
select is((select count(*)::int from public.workspaces where id = (select ws from ctx_b)), 0, 'guessed foreign workspace id returns nothing');
select is((select count(*)::int from public.memberships where workspace_id = (select ws from ctx_b)), 0, 'foreign memberships invisible');
select is((select count(*)::int from public.profiles where id = 'b0000000-0000-0000-0000-00000000000b'), 0, 'foreign profile invisible');
select is((select count(*)::int from public.profiles where id = 'a0000000-0000-0000-0000-0000000000ad'), 1, 'co-member profile visible');
select is((select count(*)::int from public.audit_events), 0, 'user without audit.view sees no audit rows');
select is((select count(*)::int from public.invitations), 0, 'user without team.invite sees no invitations');

-- ---- writes only through functions
select throws_ok($$insert into public.memberships (workspace_id, user_id, base_role) values ((select ws from ctx), 'a0000000-0000-0000-0000-0000000000a1', 'owner')$$,
  '42501', null, 'direct membership insert denied');
select throws_ok($$update public.memberships set base_role = 'owner'$$, '42501', null, 'direct membership update denied');
select throws_ok($$update public.audit_events set action = 'x'$$, '42501', null, 'audit update denied');
select throws_ok($$delete from public.audit_events$$, '42501', null, 'audit delete denied');
select throws_ok(format($$select public.change_member_access(%L, 'a0000000-0000-0000-0000-0000000000ad', 'user', %L, true)$$, (select ws from ctx), (select user_role from ctx)),
  '42501', null, 'user without role.manage cannot change access');
select throws_ok(format($$select public.invite_member(%L, 'x@a.test', 'user', %L, repeat('a',64))$$, (select ws from ctx), (select user_role from ctx)),
  '42501', null, 'user without team.invite cannot invite');
select lives_ok(format($$select public.set_member_availability(%L, 'a0000000-0000-0000-0000-0000000000a1', 'busy')$$, (select ws from ctx)), 'user sets own availability');
select throws_ok(format($$select public.set_member_availability(%L, 'a0000000-0000-0000-0000-0000000000ad', 'offline')$$, (select ws from ctx)),
  '42501', null, 'user cannot set someone else''s availability');
select throws_ok(format($$select public.set_member_availability(%L, 'b0000000-0000-0000-0000-00000000000b', 'offline')$$, (select ws from ctx_b)),
  '42501', null, 'user cannot touch another workspace');

-- ---- Admin cannot touch the Owner or mint Admins
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000ad","role":"authenticated"}', true);
select throws_ok(format($$select public.change_member_access(%L, 'a0000000-0000-0000-0000-00000000000a', 'user', %L, true)$$, (select ws from ctx), (select user_role from ctx)),
  '42501', null, 'admin cannot modify the Owner');
select throws_ok(format($$select public.invite_member(%L, 'y@a.test', 'admin', %L, repeat('b',64))$$, (select ws from ctx), (select admin_role from ctx)),
  '42501', null, 'admin cannot invite another Admin');
select throws_ok(format($$select token_hash from public.invitations$$), '42501', null, 'token_hash never readable');
select ok((select count(*) from public.audit_events) >= 3, 'admin has audit.view');

-- ---- permissions are live, not cached in a token
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-00000000000a","role":"authenticated"}', true);
select lives_ok(format($$select public.set_role_permissions(%L, %L, array['dashboard.view'])$$, (select ws from ctx), (select user_role from ctx)), 'owner edits a role');
reset role; set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"a0000000-0000-0000-0000-0000000000a1","role":"authenticated"}', true);
select is(private.has_workspace_permission((select ws from ctx), 'crm.view'), false, 'revoked permission takes effect immediately');
select is(private.has_workspace_permission((select ws from ctx), 'dashboard.view'), true, 'remaining permission still granted');

-- ---- anonymous
reset role; set local role anon;
select throws_ok($$select * from public.workspaces$$, '42501', null, 'anon cannot read workspaces');
select throws_ok($$select * from public.audit_events$$, '42501', null, 'anon cannot read audit');
select throws_ok($$select public.create_workspace('Evil', 'evil')$$, '42501', null, 'anon cannot call create_workspace');

-- ---- audit is append-only even for the table owner
reset role;
select throws_ok($$update public.audit_events set action = 'x'$$, '42501', null, 'audit update blocked by trigger');
select throws_ok($$truncate public.audit_events$$, '42501', null, 'audit truncate blocked by trigger');

select * from finish();
rollback;

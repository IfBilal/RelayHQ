-- Demo fixtures (docs/27): two isolated workspaces, "Atlas Solar" (main) and "Beacon Realty" (tenant B probe).
-- LOCAL ONLY: runs on `npx supabase db reset`. Never run against the shared remote project.
-- Users are created WITHOUT passwords (no credentials in git). Set one for a user with:
--   npx supabase auth admin ... or the Auth dashboard, then sign in.
-- Everything here is labelled fixture data; no provider-confirmed state (payments, messages) is faked.

insert into auth.users (id, email, aud, role, email_confirmed_at) values
  ('a1000000-0000-0000-0000-000000000001', 'owner@atlas.test',  'authenticated', 'authenticated', now()),
  ('a1000000-0000-0000-0000-000000000002', 'rep@atlas.test',    'authenticated', 'authenticated', now()),
  ('b1000000-0000-0000-0000-000000000001', 'owner@beacon.test', 'authenticated', 'authenticated', now());

-- Create workspaces as their owners (same path as the app: private.create_workspace derives the owner from auth.uid()).
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
select public.create_workspace('Atlas Solar', 'atlas-solar');
reset role;

select set_config('request.jwt.claims', '{"sub":"b1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
select public.create_workspace('Beacon Realty', 'beacon-realty');
reset role;

-- A restricted "User"-preset rep in Atlas (no money, no audit).
insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
select w.id, 'a1000000-0000-0000-0000-000000000002', 'user', r.id
from public.workspaces w join public.permission_roles r on r.workspace_id = w.id and r.name = 'User'
where w.slug = 'atlas-solar';

-- 500 contacts per workspace (pagination/performance fixture).
insert into public.contacts (workspace_id, name, email, phone_e164)
select w.id, 'Fixture Contact ' || i, 'fixture' || i || '@example.test', '+1555' || lpad((case when w.slug = 'atlas-solar' then i else 1000 + i end)::text, 7, '0')
from public.workspaces w, generate_series(1, 500) i
where w.slug in ('atlas-solar', 'beacon-realty');

-- 12 opportunities in Atlas's default pipeline, first stage.
insert into public.opportunities (workspace_id, pipeline_id, stage_id, contact_id, title)
select w.id, p.id,
       (select s.id from public.stages s where s.pipeline_id = p.id order by s.position limit 1),
       c.id, 'Fixture opportunity ' || c.name
from public.workspaces w
join public.pipelines p on p.workspace_id = w.id
cross join lateral (select id, name from public.contacts where workspace_id = w.id order by name limit 12) c
where w.slug = 'atlas-solar';

-- A few leads through the real capture path (routing, owner, deadline) as the Atlas owner.
select set_config('request.jwt.claims', '{"sub":"a1000000-0000-0000-0000-000000000001","role":"authenticated"}', false);
set role authenticated;
select public.capture_manual_lead(c.workspace_id, c.id, 'Fixture lead')
from (select workspace_id, id from public.contacts
      where workspace_id = (select id from public.workspaces where slug = 'atlas-solar')
      order by name limit 5) c;
reset role;

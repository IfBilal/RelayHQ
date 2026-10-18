-- S05 identity foundation: profiles, workspaces, memberships, configurable permissions,
-- invitations and an append-only audit log. Every table has RLS and explicit grants;
-- writes go through reviewed functions, never direct Data API mutations.
--
-- Error contract for functions (mapped to the HTTP envelope in src/contracts/errors.ts):
--   28000 unauthenticated -> 401   42501 forbidden -> 403   P0002 not_found -> 404
--   23505 conflict -> 409          22023 invalid_parameter_value -> 422

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- permission catalog
create table public.permissions (
  key         text primary key,
  description text not null
);

insert into public.permissions (key, description) values
  ('crm.view',               'View contacts, companies and opportunities'),
  ('crm.create',             'Create CRM records'),
  ('crm.edit',               'Edit CRM records'),
  ('crm.delete',             'Delete CRM records'),
  ('crm.export',             'Export CRM records'),
  ('opportunity.value.view', 'See opportunity values and value aggregates'),
  ('pipeline.manage',        'Manage pipelines, stages and custom fields'),
  ('lead.view',              'View leads'),
  ('lead.create',            'Create leads manually'),
  ('lead.reassign',          'Reassign leads and see the recovery queue'),
  ('assignment.manage',      'Manage assignment rules and member availability'),
  ('conversation.view',      'View conversations'),
  ('message.send',           'Send messages'),
  ('payment.create',         'Create payment requests'),
  ('appointment.view',       'View appointments'),
  ('appointment.create',     'Book and change appointments'),
  ('integrations.manage',    'Connect and manage integrations'),
  ('audit.view',             'View the audit log'),
  ('dashboard.view',         'View the dashboard'),
  ('team.invite',            'Invite members'),
  ('role.manage',            'Change member roles and role permissions');

-- ---------------------------------------------------------------- core tables
create table public.profiles (
  id                 uuid primary key references auth.users (id) on delete cascade,
  display_name       text not null default '',
  avatar_url         text,
  timezone           text not null default 'UTC',
  notification_email text,
  created_at         timestamptz not null default now()
);

create table public.workspaces (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'),
  name          text not null check (char_length(name) between 1 and 80),
  owner_user_id uuid not null references auth.users (id),
  timezone      text not null default 'UTC',
  currency      text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  created_at    timestamptz not null default now()
);

create table public.permission_roles (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 40),
  is_preset    boolean not null default false,
  created_at   timestamptz not null default now(),
  unique (workspace_id, id),
  unique (workspace_id, name)
);

create table public.role_grants (
  workspace_id uuid not null,
  role_id      uuid not null,
  permission   text not null references public.permissions (key),
  primary key (role_id, permission),
  foreign key (workspace_id, role_id) references public.permission_roles (workspace_id, id) on delete cascade
);

create table public.memberships (
  workspace_id       uuid not null references public.workspaces (id) on delete cascade,
  user_id            uuid not null references auth.users (id) on delete cascade,
  base_role          text not null check (base_role in ('owner', 'admin', 'user')),
  permission_role_id uuid,
  availability       text not null default 'available'
                     check (availability in ('available', 'busy', 'on_leave', 'offline')),
  enabled            boolean not null default true,
  created_at         timestamptz not null default now(),
  primary key (workspace_id, user_id),
  foreign key (workspace_id, permission_role_id) references public.permission_roles (workspace_id, id),
  -- the Owner's access is implicit; everyone else needs a permission role
  check (base_role = 'owner' or permission_role_id is not null)
);
create unique index memberships_one_owner on public.memberships (workspace_id) where base_role = 'owner';
create index memberships_user_idx on public.memberships (user_id) where enabled;

create table public.invitations (
  id                 uuid primary key default gen_random_uuid(),
  workspace_id       uuid not null,
  email              text not null check (email = lower(email)),
  base_role          text not null check (base_role in ('admin', 'user')),
  permission_role_id uuid not null,
  token_hash         text not null unique,
  invited_by         uuid not null references auth.users (id),
  expires_at         timestamptz not null,
  accepted_at        timestamptz,
  created_at         timestamptz not null default now(),
  foreign key (workspace_id, permission_role_id) references public.permission_roles (workspace_id, id)
);
create unique index invitations_open_email on public.invitations (workspace_id, email) where accepted_at is null;

create table public.audit_events (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references public.workspaces (id),
  actor_user_id uuid,            -- null = system
  action        text not null,
  entity_type   text not null,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  request_id    text,
  created_at    timestamptz not null default now()
);
create index audit_events_ws_time_idx on public.audit_events (workspace_id, created_at desc);

-- Tamper resistance (F4.3): reject changes even from privileged roles.
create function private.reject_audit_change() returns trigger language plpgsql set search_path = '' as $$
begin
  raise exception 'audit_events is append-only' using errcode = '42501';
end $$;
create trigger audit_events_no_update before update or delete on public.audit_events
  for each row execute function private.reject_audit_change();
create trigger audit_events_no_truncate before truncate on public.audit_events
  for each statement execute function private.reject_audit_change();

-- ---------------------------------------------------------------- helper functions
create function private.is_workspace_member(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.enabled
  );
$$;

create function private.has_workspace_permission(p_workspace uuid, p_permission text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace and m.user_id = (select auth.uid()) and m.enabled
      and (
        m.base_role = 'owner'
        or exists (
          select 1 from public.role_grants g
          where g.workspace_id = m.workspace_id
            and g.role_id = m.permission_role_id
            and g.permission = p_permission
        )
      )
  );
$$;

create function private.shares_workspace_with(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.memberships mine
    join public.memberships theirs on theirs.workspace_id = mine.workspace_id
    where mine.user_id = (select auth.uid()) and mine.enabled and theirs.user_id = p_user
  );
$$;

create function private.append_audit(
  p_workspace uuid, p_actor uuid, p_action text, p_entity_type text, p_entity_id text,
  p_before jsonb, p_after jsonb
) returns void language sql security definer set search_path = '' as $$
  insert into public.audit_events (workspace_id, actor_user_id, action, entity_type, entity_id, before, after)
  values (p_workspace, p_actor, p_action, p_entity_type, p_entity_id, p_before, p_after);
$$;

grant execute on function
  private.is_workspace_member(uuid),
  private.has_workspace_permission(uuid, text),
  private.shares_workspace_with(uuid)
to authenticated;

-- ---------------------------------------------------------------- profile bootstrap
create function private.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, notification_email)
  values (new.id, coalesce(nullif(new.raw_user_meta_data ->> 'name', ''), split_part(new.email, '@', 1)), new.email)
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------- preset roles
create function private.preset_permissions(p_name text) returns text[]
language sql immutable set search_path = '' as $$
  select case p_name
    when 'Manager' then array[
      'crm.view','crm.create','crm.edit','crm.export','opportunity.value.view','lead.view','lead.create',
      'lead.reassign','assignment.manage','conversation.view','message.send','payment.create',
      'appointment.view','appointment.create','audit.view','dashboard.view']
    when 'User' then array[
      'crm.view','crm.create','crm.edit','lead.view','lead.create','conversation.view','message.send',
      'appointment.view','appointment.create','dashboard.view']
  end;
$$;

-- ---------------------------------------------------------------- workspace bootstrap (F1.1)
create function private.create_workspace_for_authenticated_user(p_name text, p_slug text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_ws  uuid;
  v_role uuid;
  v_name text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if char_length(btrim(coalesce(p_name, ''))) not between 1 and 80 then
    raise exception 'invalid workspace name' using errcode = '22023';
  end if;
  if p_slug !~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$' then
    raise exception 'invalid workspace slug' using errcode = '22023';
  end if;

  insert into public.workspaces (slug, name, owner_user_id) values (p_slug, btrim(p_name), v_uid)
  returning id into v_ws; -- a taken slug raises 23505 (409)

  -- Admin gets every permission; Manager and User are the preset bundles.
  insert into public.permission_roles (workspace_id, name, is_preset) values (v_ws, 'Admin', true) returning id into v_role;
  insert into public.role_grants (workspace_id, role_id, permission)
    select v_ws, v_role, key from public.permissions;
  foreach v_name in array array['Manager', 'User'] loop
    insert into public.permission_roles (workspace_id, name, is_preset) values (v_ws, v_name, true) returning id into v_role;
    insert into public.role_grants (workspace_id, role_id, permission)
      select v_ws, v_role, unnest(private.preset_permissions(v_name));
  end loop;

  insert into public.memberships (workspace_id, user_id, base_role) values (v_ws, v_uid, 'owner');
  perform private.append_audit(v_ws, v_uid, 'workspace.created', 'workspace', v_ws::text, null,
    jsonb_build_object('name', btrim(p_name), 'slug', p_slug));
  return v_ws;
end $$;

-- ---------------------------------------------------------------- invitations (F1.2)
create function private.invite_member(
  p_workspace uuid, p_email text, p_base_role text, p_role uuid, p_token_hash text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_id  uuid;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'team.invite') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_base_role not in ('admin', 'user') then raise exception 'invalid role' using errcode = '22023'; end if;
  -- only the Owner hands out the Admin level
  if p_base_role = 'admin' and not exists (
    select 1 from public.memberships where workspace_id = p_workspace and user_id = v_uid and base_role = 'owner'
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;

  insert into public.invitations (workspace_id, email, base_role, permission_role_id, token_hash, invited_by, expires_at)
  values (p_workspace, lower(p_email), p_base_role, p_role, p_token_hash, v_uid, now() + interval '7 days')
  returning id into v_id;
  perform private.append_audit(p_workspace, v_uid, 'member.invited', 'invitation', v_id::text, null,
    jsonb_build_object('email', lower(p_email), 'base_role', p_base_role, 'permission_role_id', p_role));
  return v_id;
end $$;

create function private.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select lower(email) into v_email from auth.users where id = v_uid;

  select * into v_inv from public.invitations
  where token_hash = encode(extensions.digest(p_token, 'sha256'), 'hex')
    and accepted_at is null and expires_at > now() and email = v_email
  for update;
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;

  insert into public.memberships (workspace_id, user_id, base_role, permission_role_id)
  values (v_inv.workspace_id, v_uid, v_inv.base_role, v_inv.permission_role_id); -- duplicate -> 23505
  update public.invitations set accepted_at = now() where id = v_inv.id;
  perform private.append_audit(v_inv.workspace_id, v_uid, 'member.joined', 'membership', v_uid::text, null,
    jsonb_build_object('base_role', v_inv.base_role, 'permission_role_id', v_inv.permission_role_id));
  return v_inv.workspace_id;
end $$;

-- ---------------------------------------------------------------- role and access changes (F1.2, F1.3)
create function private.change_member_access(
  p_workspace uuid, p_target uuid, p_base_role text, p_role uuid, p_enabled boolean
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_caller text;
  v_old    public.memberships;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'role.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select base_role into v_caller from public.memberships where workspace_id = p_workspace and user_id = v_uid;

  select * into v_old from public.memberships where workspace_id = p_workspace and user_id = p_target for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_old.base_role = 'owner' then raise exception 'the Owner cannot be modified' using errcode = '42501'; end if;
  if p_base_role not in ('admin', 'user') then raise exception 'invalid role' using errcode = '22023'; end if;
  if p_target = v_uid and (p_enabled is false or p_base_role <> v_old.base_role) then
    raise exception 'cannot change your own access' using errcode = '42501';
  end if;
  -- Admin level can only be granted or removed by the Owner
  if (p_base_role = 'admin' or v_old.base_role = 'admin') and p_base_role <> v_old.base_role and v_caller <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.memberships
     set base_role = p_base_role, permission_role_id = p_role, enabled = p_enabled
   where workspace_id = p_workspace and user_id = p_target;
  perform private.append_audit(p_workspace, v_uid, 'member.access_changed', 'membership', p_target::text,
    jsonb_build_object('base_role', v_old.base_role, 'permission_role_id', v_old.permission_role_id, 'enabled', v_old.enabled),
    jsonb_build_object('base_role', p_base_role, 'permission_role_id', p_role, 'enabled', p_enabled));
end $$;

create function private.set_role_permissions(p_workspace uuid, p_role uuid, p_permissions text[]) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid    uuid := (select auth.uid());
  v_before text[];
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'role.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (select 1 from public.permission_roles where id = p_role and workspace_id = p_workspace) then
    raise exception 'role not found' using errcode = 'P0002';
  end if;
  if exists (select 1 from unnest(p_permissions) k where k not in (select key from public.permissions)) then
    raise exception 'unknown permission' using errcode = '22023';
  end if;

  select coalesce(array_agg(permission order by permission), '{}') into v_before
    from public.role_grants where role_id = p_role;
  delete from public.role_grants where role_id = p_role;
  insert into public.role_grants (workspace_id, role_id, permission)
    select p_workspace, p_role, k from (select distinct unnest(p_permissions) k) s;
  perform private.append_audit(p_workspace, v_uid, 'role.permissions_changed', 'permission_role', p_role::text,
    jsonb_build_object('permissions', v_before),
    jsonb_build_object('permissions', (select coalesce(jsonb_agg(k order by k), '[]') from (select distinct unnest(p_permissions) k) s)));
end $$;

-- ---------------------------------------------------------------- availability (F3.2)
-- Reassignment of unacknowledged leads (F3.6) hooks in here when the lead engine lands.
create function private.set_member_availability(p_workspace uuid, p_target uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_old text;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if p_status not in ('available', 'busy', 'on_leave', 'offline') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if p_target <> v_uid and not private.has_workspace_permission(p_workspace, 'assignment.manage') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_target = v_uid and not private.is_workspace_member(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  select availability into v_old from public.memberships
   where workspace_id = p_workspace and user_id = p_target and enabled for update;
  if not found then raise exception 'member not found' using errcode = 'P0002'; end if;
  update public.memberships set availability = p_status where workspace_id = p_workspace and user_id = p_target;
  perform private.append_audit(p_workspace, v_uid, 'member.availability_changed', 'membership', p_target::text,
    jsonb_build_object('availability', v_old), jsonb_build_object('availability', p_status));
end $$;

grant execute on function
  private.create_workspace_for_authenticated_user(text, text),
  private.invite_member(uuid, text, text, uuid, text),
  private.accept_invitation(text),
  private.change_member_access(uuid, uuid, text, uuid, boolean),
  private.set_role_permissions(uuid, uuid, text[]),
  private.set_member_availability(uuid, uuid, text)
to authenticated;

-- ---------------------------------------------------------------- invoker wrappers for PostgREST
-- Thin SECURITY INVOKER entry points: identity comes from auth.uid() inside the private function.
create function public.create_workspace(p_name text, p_slug text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.create_workspace_for_authenticated_user(p_name, p_slug);
$$;
create function public.invite_member(p_workspace uuid, p_email text, p_base_role text, p_role uuid, p_token_hash text) returns uuid
language sql security invoker set search_path = '' as $$
  select private.invite_member(p_workspace, p_email, p_base_role, p_role, p_token_hash);
$$;
create function public.accept_invitation(p_token text) returns uuid
language sql security invoker set search_path = '' as $$ select private.accept_invitation(p_token); $$;
create function public.change_member_access(p_workspace uuid, p_target uuid, p_base_role text, p_role uuid, p_enabled boolean) returns void
language sql security invoker set search_path = '' as $$
  select private.change_member_access(p_workspace, p_target, p_base_role, p_role, p_enabled);
$$;
create function public.set_role_permissions(p_workspace uuid, p_role uuid, p_permissions text[]) returns void
language sql security invoker set search_path = '' as $$
  select private.set_role_permissions(p_workspace, p_role, p_permissions);
$$;
create function public.set_member_availability(p_workspace uuid, p_target uuid, p_status text) returns void
language sql security invoker set search_path = '' as $$
  select private.set_member_availability(p_workspace, p_target, p_status);
$$;

revoke execute on function
  public.create_workspace(text, text),
  public.invite_member(uuid, text, text, uuid, text),
  public.accept_invitation(text),
  public.change_member_access(uuid, uuid, text, uuid, boolean),
  public.set_role_permissions(uuid, uuid, text[]),
  public.set_member_availability(uuid, uuid, text)
from public, anon;
grant execute on function
  public.create_workspace(text, text),
  public.invite_member(uuid, text, text, uuid, text),
  public.accept_invitation(text),
  public.change_member_access(uuid, uuid, text, uuid, boolean),
  public.set_role_permissions(uuid, uuid, text[]),
  public.set_member_availability(uuid, uuid, text)
to authenticated;

-- ---------------------------------------------------------------- RLS + grants
alter table public.permissions      enable row level security;
alter table public.profiles         enable row level security;
alter table public.workspaces       enable row level security;
alter table public.permission_roles enable row level security;
alter table public.role_grants      enable row level security;
alter table public.memberships      enable row level security;
alter table public.invitations      enable row level security;
alter table public.audit_events     enable row level security;

-- Supabase default privileges hand out ALL; start from nothing.
revoke all on public.permissions, public.profiles, public.workspaces, public.permission_roles,
  public.role_grants, public.memberships, public.invitations, public.audit_events
from anon, authenticated;

grant select on public.permissions to authenticated;
create policy permissions_read on public.permissions for select to authenticated using (true);

grant select on public.profiles to authenticated;
grant update (display_name, avatar_url, timezone, notification_email) on public.profiles to authenticated;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.shares_workspace_with(id)));
create policy profiles_update_own on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

grant select on public.workspaces to authenticated;
create policy workspaces_select on public.workspaces for select to authenticated
  using ((select private.is_workspace_member(id)));

grant select on public.permission_roles, public.role_grants, public.memberships to authenticated;
create policy permission_roles_select on public.permission_roles for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy role_grants_select on public.role_grants for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));
create policy memberships_select on public.memberships for select to authenticated
  using ((select private.is_workspace_member(workspace_id)));

-- token_hash is never readable through the Data API
grant select (id, workspace_id, email, base_role, permission_role_id, invited_by, expires_at, accepted_at, created_at)
  on public.invitations to authenticated;
create policy invitations_select on public.invitations for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'team.invite')));

grant select on public.audit_events to authenticated;
create policy audit_events_select on public.audit_events for select to authenticated
  using ((select private.has_workspace_permission(workspace_id, 'audit.view')));

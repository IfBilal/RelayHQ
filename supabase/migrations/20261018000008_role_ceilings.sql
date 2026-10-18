-- Privilege-escalation fixes found in review:
--  * set_role_permissions: a non-Owner could edit a role to hold permissions they lack (incl. their own role).
--  * change_member_access: a non-Owner could assign a broader role, or modify/disable an Admin.
--  * accept_invitation: required a matching email but not a verified one.
-- Rule: a non-Owner can only touch roles/permissions that are a subset of their own. The Owner is exempt.

create function private.is_workspace_owner(p_workspace uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.memberships
                 where workspace_id = p_workspace and user_id = (select auth.uid()) and base_role = 'owner' and enabled);
$$;

-- true when the caller holds every permission the role grants (Owner: always)
create function private.role_within_caller(p_workspace uuid, p_role uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_workspace_owner(p_workspace) or not exists (
    select 1 from public.role_grants g
    where g.workspace_id = p_workspace and g.role_id = p_role
      and not private.has_workspace_permission(p_workspace, g.permission)
  );
$$;

create or replace function private.set_role_permissions(p_workspace uuid, p_role uuid, p_permissions text[]) returns void
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
  -- ceiling: neither the current nor the new permission set may exceed the caller's own
  if not private.role_within_caller(p_workspace, p_role)
     or (not private.is_workspace_owner(p_workspace)
         and exists (select 1 from unnest(p_permissions) k where not private.has_workspace_permission(p_workspace, k))) then
    raise exception 'forbidden' using errcode = '42501';
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

create or replace function private.change_member_access(
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
  -- the Admin level is the Owner's: only the Owner grants, changes, disables or removes it
  if (p_base_role = 'admin' or v_old.base_role = 'admin') and v_caller <> 'owner' then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- the assigned role cannot exceed the caller's own permissions
  if not private.role_within_caller(p_workspace, p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  update public.memberships
     set base_role = p_base_role, permission_role_id = p_role, enabled = p_enabled
   where workspace_id = p_workspace and user_id = p_target;
  perform private.append_audit(p_workspace, v_uid, 'member.access_changed', 'membership', p_target::text,
    jsonb_build_object('base_role', v_old.base_role, 'permission_role_id', v_old.permission_role_id, 'enabled', v_old.enabled),
    jsonb_build_object('base_role', p_base_role, 'permission_role_id', p_role, 'enabled', p_enabled));
  if v_old.enabled and not p_enabled then
    -- a disabled member must not keep owning leads
    update public.memberships set availability = 'offline' where workspace_id = p_workspace and user_id = p_target;
    perform private.reassign_unacknowledged_leads(p_workspace, p_target, v_uid, true);
  end if;
end $$;

-- only a verified email can redeem an invitation
create or replace function private.accept_invitation(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text;
  v_inv   public.invitations;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  select lower(email) into v_email from auth.users where id = v_uid and email_confirmed_at is not null;

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

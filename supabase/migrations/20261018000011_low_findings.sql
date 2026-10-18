-- Low-severity review findings.
--  1. set_role_permissions: only the Owner may edit the Admin preset or any role held by an Admin-level member.
--  2. invitations: an expired pending invite no longer blocks re-inviting the same address; inviting someone who is
--     already a member is refused; pending invites can be revoked.
--  3. profiles.notification_email: no longer writable through the table grant. It changes through a function that
--     validates the address and writes an audit row (domain only), because alert emails go to this address.

-- 1 ---------------------------------------------------------------------------------------------------------------
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
  -- Admin tier belongs to the Owner
  if not private.is_workspace_owner(p_workspace) and (
       exists (select 1 from public.permission_roles r where r.id = p_role and r.is_preset and r.name = 'Admin')
       or exists (select 1 from public.memberships m where m.workspace_id = p_workspace and m.permission_role_id = p_role and m.base_role = 'admin')
     ) then
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

-- 2 ---------------------------------------------------------------------------------------------------------------
create or replace function private.invite_member(
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
  if p_base_role = 'admin' and not private.is_workspace_owner(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  -- the invited role cannot exceed the inviter's own permissions
  if not private.role_within_caller(p_workspace, p_role) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invitation' using errcode = '22023';
  end if;
  if exists (select 1 from public.memberships m join auth.users u on u.id = m.user_id
             where m.workspace_id = p_workspace and lower(u.email) = lower(p_email)) then
    raise exception 'already a member' using errcode = '23505';
  end if;

  -- an expired, unaccepted invite for the same address is replaced
  delete from public.invitations
   where workspace_id = p_workspace and email = lower(p_email) and accepted_at is null and expires_at <= now();

  insert into public.invitations (workspace_id, email, base_role, permission_role_id, token_hash, invited_by, expires_at)
  values (p_workspace, lower(p_email), p_base_role, p_role, p_token_hash, v_uid, now() + interval '7 days')
  returning id into v_id; -- a still-valid pending invite for the address raises 23505
  perform private.append_audit(p_workspace, v_uid, 'member.invited', 'invitation', v_id::text, null,
    jsonb_build_object('email', lower(p_email), 'base_role', p_base_role, 'permission_role_id', p_role));
  return v_id;
end $$;

create function private.revoke_invitation(p_workspace uuid, p_invitation uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.invitations;
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if not private.has_workspace_permission(p_workspace, 'team.invite') then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  select * into v_inv from public.invitations
   where id = p_invitation and workspace_id = p_workspace and accepted_at is null for update;
  if not found then raise exception 'invitation not found' using errcode = 'P0002'; end if;
  -- Admin-level invitations are the Owner's to revoke
  if v_inv.base_role = 'admin' and not private.is_workspace_owner(p_workspace) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  delete from public.invitations where id = p_invitation;
  perform private.append_audit(p_workspace, v_uid, 'member.invite_revoked', 'invitation', p_invitation::text, null,
    jsonb_build_object('base_role', v_inv.base_role));
end $$;

-- 3 ---------------------------------------------------------------------------------------------------------------
revoke update on public.profiles from authenticated;
grant update (display_name, avatar_url, timezone) on public.profiles to authenticated;

create function private.set_notification_email(p_email text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := (select auth.uid());
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
begin
  if v_uid is null then raise exception 'unauthenticated' using errcode = '28000'; end if;
  if v_email is not null and (v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' or char_length(v_email) > 254) then
    raise exception 'invalid email' using errcode = '22023';
  end if;
  update public.profiles set notification_email = v_email where id = v_uid;
  if not found then raise exception 'profile not found' using errcode = 'P0002'; end if;
  -- audit in every workspace the user belongs to; the domain only, not the address
  perform private.append_audit(m.workspace_id, v_uid, 'profile.notification_email_changed', 'profile', v_uid::text, null,
    jsonb_build_object('domain', coalesce(split_part(v_email, '@', 2), '')))
  from public.memberships m where m.user_id = v_uid;
end $$;

grant execute on function
  private.revoke_invitation(uuid, uuid),
  private.set_notification_email(text)
to authenticated;

create function public.revoke_invitation(p_workspace uuid, p_invitation uuid) returns void
language sql security invoker set search_path = '' as $$ select private.revoke_invitation(p_workspace, p_invitation); $$;
create function public.set_notification_email(p_email text) returns void
language sql security invoker set search_path = '' as $$ select private.set_notification_email(p_email); $$;

revoke execute on function public.revoke_invitation(uuid, uuid), public.set_notification_email(text) from public, anon;
grant execute on function public.revoke_invitation(uuid, uuid), public.set_notification_email(text) to authenticated;

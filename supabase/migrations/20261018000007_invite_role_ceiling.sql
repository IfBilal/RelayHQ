-- Privilege escalation fix: a team.invite holder could invite someone into a permission role that grants more
-- than the inviter holds. The invited role's permissions must be a subset of the inviter's (the Owner is exempt).
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
  if p_base_role = 'admin' and not exists (
    select 1 from public.memberships where workspace_id = p_workspace and user_id = v_uid and base_role = 'owner'
  ) then raise exception 'forbidden' using errcode = '42501'; end if;
  -- the invited role cannot exceed the inviter's own permissions
  if not exists (select 1 from public.memberships where workspace_id = p_workspace and user_id = v_uid and base_role = 'owner')
     and exists (
       select 1 from public.role_grants g
       where g.workspace_id = p_workspace and g.role_id = p_role
         and not private.has_workspace_permission(p_workspace, g.permission)
     ) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
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

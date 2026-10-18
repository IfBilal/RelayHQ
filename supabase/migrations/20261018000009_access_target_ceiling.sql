-- Review fix: change_member_access checked only the NEW role against the caller's permissions. A non-Owner with
-- role.manage could still demote or lock out a member whose CURRENT role is broader than their own by moving them
-- to a lesser role. The target's current role must also be within the caller's ceiling (Owner exempt).
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
  -- both the assigned role and the target's current role must be within the caller's own permissions
  if not private.role_within_caller(p_workspace, p_role)
     or (v_old.permission_role_id is not null and not private.role_within_caller(p_workspace, v_old.permission_role_id)) then
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
